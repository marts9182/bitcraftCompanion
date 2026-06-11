import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { PRICE_SENTINEL_CEILING } from "@bcc/shared";
import { getDb } from "@/lib/db";
import {
  deriveDealMath, filterDeals, DEALS_CAP,
  type Deal, type DealFilters,
} from "@/lib/market/deals";

/**
 * Crossed-pair scan bound. Cache design: ONE unfiltered DB query (the top
 * RAW_CAP crossed pairs by total profit) is unstable_cache'd and shared across
 * every filter combination; filtering happens in JS per request. Trade-off:
 * filters can only surface deals inside the global top-2000 — beyond that the
 * page is showing 10× its display cap (DEALS_CAP=200) of the most profitable
 * pairs, so misses are marginal by construction.
 */
const RAW_CAP = 2000;

interface RawPairRow {
  item_id: number;
  item_type: number;
  item_name: string | null;
  item_slug: string | null;
  icon_asset_name: string | null;
  tier: number | null;
  rarity: string | null;
  pay_price: number;
  receive_price: number;
  sell_qty: number;
  buy_qty: number;
  // "buy" claim = where YOU buy = the SELL order's marketplace (and vice versa).
  buy_claim_id: string | null;
  buy_claim_name: string | null;
  buy_region: string;
  buy_x: number | null;
  buy_z: number | null;
  sell_claim_id: string | null;
  sell_claim_name: string | null;
  sell_region: string;
  sell_x: number | null;
  sell_z: number | null;
}

/**
 * Top crossed order pairs (buy-order price > sell-order price) per item,
 * marketplace-to-marketplace, ordered by total profit.
 *
 * Coordinates come from map_claims (claim center, small-hex) — verified 100%
 * coverage of marketplace claims in production today. marketplaces.x/z
 * (building-precise, migration 0015) is deliberately NOT read here yet: the
 * column only exists after the owner applies the migration, and referencing it
 * earlier would 500 the page. Follow-up once 0015 is applied + a snapshot has
 * filled it: COALESCE(marketplace avg coords, claim coords). Claim-center
 * error is bounded by claim radius — noise at inter-settlement distances.
 *
 * Casts: prices fit ::int (sentinel-capped < 4×10⁸); coords cast ::float8 so
 * postgres-js returns JS numbers rather than numeric strings.
 *
 * Zero-price sell orders are excluded: profit % is undefined for them and they
 * are near-certain placeholders rather than real giveaways.
 */
const fetchCrossedPairs = unstable_cache(
  async (): Promise<RawPairRow[]> => {
    const db = getDb();
    const rows = (await db.execute(sql`
      WITH crossed AS (
        SELECT
          s.item_id, s.item_type,
          s.price::int AS pay_price, b.price::int AS receive_price,
          s.quantity AS sell_qty, b.quantity AS buy_qty,
          s.claim_entity_id AS buy_claim_id, s.region AS buy_region,
          b.claim_entity_id AS sell_claim_id, b.region AS sell_region,
          ((b.price - s.price) * LEAST(s.quantity, b.quantity))::float8 AS profit_total
        FROM market_orders s
        JOIN market_orders b
          ON b.item_id = s.item_id AND b.item_type = s.item_type
         AND b.side = 'buy' AND b.price > s.price
        WHERE s.side = 'sell'
          AND s.price > 0 AND s.price < ${PRICE_SENTINEL_CEILING}
          AND b.price < ${PRICE_SENTINEL_CEILING}
          AND s.quantity > 0 AND b.quantity > 0
        ORDER BY profit_total DESC
        LIMIT ${RAW_CAP}
      )
      SELECT
        c.item_id, c.item_type,
        mis.item_name, mis.item_slug, mis.icon_asset_name, mis.tier, mis.rarity,
        c.pay_price, c.receive_price, c.sell_qty, c.buy_qty,
        c.buy_claim_id, bc.name AS buy_claim_name, c.buy_region,
        bmc.x::float8 AS buy_x, bmc.z::float8 AS buy_z,
        c.sell_claim_id, sc.name AS sell_claim_name, c.sell_region,
        smc.x::float8 AS sell_x, smc.z::float8 AS sell_z
      FROM crossed c
      LEFT JOIN market_item_summary mis ON mis.item_id = c.item_id AND mis.item_type = c.item_type
      LEFT JOIN claims bc ON bc.entity_id = c.buy_claim_id
      LEFT JOIN claims sc ON sc.entity_id = c.sell_claim_id
      LEFT JOIN map_claims bmc ON bmc.entity_id = c.buy_claim_id
      LEFT JOIN map_claims smc ON smc.entity_id = c.sell_claim_id
      ORDER BY c.profit_total DESC
    `)) as unknown as RawPairRow[];
    return rows;
  },
  ["market-deals-crossed-pairs"],
  { revalidate: 1800 },
);

export interface DealsResult {
  deals: Deal[];
  /** Crossed pairs matching the filters (before the display cap). */
  matching: number;
  /** Total crossed pairs scanned (unfiltered, bounded by RAW_CAP). */
  totalCrossed: number;
  /** True when at least one non-instant pair has a computable distance. */
  hasDistances: boolean;
  /** True when the scan hit RAW_CAP — deeper deals exist but are below the global cut. */
  scanTruncated: boolean;
}

function toDeal(r: RawPairRow): Deal {
  const buyAt = {
    claimEntityId: r.buy_claim_id ?? "",
    claimName: r.buy_claim_name ?? "",
    region: r.buy_region,
    x: r.buy_x,
    z: r.buy_z,
  };
  const sellAt = {
    claimEntityId: r.sell_claim_id ?? "",
    claimName: r.sell_claim_name ?? "",
    region: r.sell_region,
    x: r.sell_x,
    z: r.sell_z,
  };
  return {
    itemId: r.item_id,
    itemType: r.item_type,
    itemName: r.item_name ?? "",
    itemSlug: r.item_slug ?? "",
    iconAssetName: r.icon_asset_name,
    tier: r.tier,
    rarity: r.rarity ?? "Default",
    buyAt,
    sellAt,
    payPrice: r.pay_price,
    receivePrice: r.receive_price,
    ...deriveDealMath({
      payPrice: r.pay_price,
      receivePrice: r.receive_price,
      sellQty: r.sell_qty,
      buyQty: r.buy_qty,
      buyAt,
      sellAt,
    }),
  };
}

/** Filtered arbitrage deals, capped at DEALS_CAP by total profit (SQL pre-sorts). */
export async function getDeals(filters: DealFilters): Promise<DealsResult> {
  const raw = await fetchCrossedPairs();
  const all = raw.map(toDeal);
  const matching = filterDeals(all, filters);
  return {
    deals: matching.slice(0, DEALS_CAP),
    matching: matching.length,
    totalCrossed: all.length,
    hasDistances: all.some((d) => !d.instantFlip && d.distanceTiles !== null),
    scanTruncated: all.length >= RAW_CAP,
  };
}
