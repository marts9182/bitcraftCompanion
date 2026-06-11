/**
 * Pure math + filter/param helpers for the /market/deals arbitrage finder.
 *
 * Direction language (plain-language sweep — never "ask"/"bid"):
 * a deal = YOU buy from someone's SELL order, travel, and sell into someone's
 * BUY order. So from the trader's perspective:
 *   - payPrice     = the sell order's price (what you pay per unit)
 *   - receivePrice = the buy order's price (what you receive per unit)
 *   - buyAt        = the sell order's marketplace ("Buy at X for 2")
 *   - sellAt       = the buy order's marketplace ("sell at Y for 125")
 *
 * Distance unit: game TILES — small-hex coords ÷ 3, the same convention as
 * formatGameCoords' N/E readout. Straight-line (as the crow flies).
 */

export const DEALS_CAP = 200;

/** Default MAX profit % — kills stale-order traps (absurd 10000% rows from
 *  forgotten 1-coin sell orders). Users can raise it or clear the field. */
export const DEFAULT_MAX_PROFIT_PCT = 500;

export interface DealLocation {
  claimEntityId: string;
  claimName: string;
  region: string;
  /** Small-hex world coords (marketplace building, falling back to the claim). Null when unknown. */
  x: number | null;
  z: number | null;
}

export interface Deal {
  itemId: number;
  itemType: number;
  itemName: string;
  itemSlug: string;
  iconAssetName: string | null;
  tier: number | null;
  rarity: string;
  buyAt: DealLocation;
  sellAt: DealLocation;
  payPrice: number;
  receivePrice: number;
  /** min(sell order qty, buy order qty) — the most you can flip in one trip. */
  qty: number;
  profitEach: number;
  profitTotal: number;
  /** profitEach / payPrice × 100. Null when payPrice ≤ 0. */
  profitPct: number | null;
  /** Straight-line tiles between the two marketplaces. 0 for instant flips; null when coords unknown. */
  distanceTiles: number | null;
  /** profitTotal / distanceTiles. Null for instant flips (no travel) and unknown distances. */
  profitPerTile: number | null;
  /** Both orders sit at the SAME marketplace — no travel, flip on the spot. */
  instantFlip: boolean;
}

/** Profit % relative to what you pay (the sell-order price). Null when payPrice ≤ 0. */
export function profitPercent(payPrice: number, receivePrice: number): number | null {
  if (payPrice <= 0) return null;
  return ((receivePrice - payPrice) / payPrice) * 100;
}

/** Straight-line distance in game tiles (small-hex Euclidean ÷ 3). Null if either end is unknown. */
export function distanceTiles(
  ax: number | null,
  az: number | null,
  bx: number | null,
  bz: number | null,
): number | null {
  if (ax == null || az == null || bx == null || bz == null) return null;
  return Math.hypot(bx - ax, bz - az) / 3;
}

/** Profit per tile travelled. Null for unknown distance AND distance 0 (instant flip — never divide by zero). */
export function profitPerTile(profitTotal: number, distance: number | null): number | null {
  if (distance == null || distance === 0) return null;
  return profitTotal / distance;
}

export interface DealPairInput {
  payPrice: number;
  receivePrice: number;
  sellQty: number;
  buyQty: number;
  buyAt: DealLocation;
  sellAt: DealLocation;
}

export type DealMath = Pick<
  Deal,
  "qty" | "profitEach" | "profitTotal" | "profitPct" | "distanceTiles" | "profitPerTile" | "instantFlip"
>;

/** Derive every computed field of a deal from one crossed order pair. */
export function deriveDealMath(p: DealPairInput): DealMath {
  const qty = Math.min(p.sellQty, p.buyQty);
  const profitEach = p.receivePrice - p.payPrice;
  const profitTotal = profitEach * qty;
  const instantFlip = p.buyAt.claimEntityId !== "" && p.buyAt.claimEntityId === p.sellAt.claimEntityId;
  const distance = instantFlip ? 0 : distanceTiles(p.buyAt.x, p.buyAt.z, p.sellAt.x, p.sellAt.z);
  return {
    qty,
    profitEach,
    profitTotal,
    profitPct: profitPercent(p.payPrice, p.receivePrice),
    distanceTiles: distance,
    profitPerTile: profitPerTile(profitTotal, distance),
    instantFlip,
  };
}

export interface DealFilters {
  minQty?: number;
  minPct?: number;
  maxPct?: number;
  /** Tiles. Applies ONLY to rows with a known distance — rows missing coords pass through
   *  (production has no marketplace coords until a post-merge snapshot fills them). */
  maxDistance?: number;
  /** Region id ("7"). A pair matches when EITHER end is in the region. */
  region?: string;
}

export function filterDeals(deals: Deal[], f: DealFilters): Deal[] {
  return deals.filter((d) => {
    if (f.minQty !== undefined && d.qty < f.minQty) return false;
    // Unknown profit % fails any active pct bound: it cannot be verified not-a-trap.
    if (f.minPct !== undefined && (d.profitPct === null || d.profitPct < f.minPct)) return false;
    if (f.maxPct !== undefined && (d.profitPct === null || d.profitPct > f.maxPct)) return false;
    if (f.maxDistance !== undefined && d.distanceTiles !== null && d.distanceTiles > f.maxDistance) return false;
    if (f.region && d.buyAt.region !== f.region && d.sellAt.region !== f.region) return false;
    return true;
  });
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function positiveNum(v: string | string[] | undefined): number | undefined {
  const s = one(v)?.trim();
  if (!s || !/^\d+$/.test(s)) return undefined;
  const n = Number.parseInt(s, 10);
  return n > 0 ? n : undefined;
}

/**
 * GET-form params → DealFilters. maxPct semantics: ABSENT → DEFAULT_MAX_PROFIT_PCT
 * (stale-trap protection on by default); present-but-EMPTY → cap disabled (the
 * user cleared the field); numeric → that value; present-but-garbage ("abc",
 * non-positive) → DEFAULT_MAX_PROFIT_PCT (never let junk disable the protective cap).
 */
export function parseDealsParams(sp: SP): DealFilters {
  const filters: DealFilters = {};
  const minQty = positiveNum(sp.minQty);
  if (minQty !== undefined) filters.minQty = minQty;
  const minPct = positiveNum(sp.minPct);
  if (minPct !== undefined) filters.minPct = minPct;
  if ("maxPct" in sp) {
    const maxPct = positiveNum(sp.maxPct);
    if (maxPct !== undefined) {
      filters.maxPct = maxPct;
    } else if (one(sp.maxPct) !== "") {
      // Unparsable but not the deliberate cleared-field "" → keep the cap.
      filters.maxPct = DEFAULT_MAX_PROFIT_PCT;
    }
  } else {
    filters.maxPct = DEFAULT_MAX_PROFIT_PCT;
  }
  const maxDistance = positiveNum(sp.maxDistance);
  if (maxDistance !== undefined) filters.maxDistance = maxDistance;
  const region = one(sp.region)?.trim();
  if (region) filters.region = region;
  return filters;
}
