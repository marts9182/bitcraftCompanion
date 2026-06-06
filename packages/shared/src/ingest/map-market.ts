import { toInt } from "./decode";

type Raw = Record<string, unknown>;
const idStr = (v: unknown): string => (v == null ? "" : String(v));

/** Prices at/above this are treated as sentinels/placeholders (observed ~429M ≈ 2³²/10),
 *  excluded from best-price/quantity aggregates, flagged (not hidden) in the order ladder. */
export const PRICE_SENTINEL_CEILING = 400_000_000;

/** SpacetimeDB Timestamp is microseconds since the Unix epoch → integer JS milliseconds.
 *  Microsecond values stay below Number.MAX_SAFE_INTEGER (2^53) until ~year 2255, so
 *  Number precision is not a concern at game timescales. */
export function gameTimestampToMs(ts: unknown): number {
  return Math.trunc((toInt(ts) ?? 0) / 1000);
}

export interface MarketOrderRow {
  entityId: string;
  region: string;
  side: "sell" | "buy";
  itemId: number;
  itemType: number;
  claimEntityId: string;
  ownerEntityId: string;
  price: number;
  quantity: number;
  storedCoins: number;
  timestamp: number;
}

function mapOrderSide(rows: Raw[], side: "sell" | "buy", region: string): MarketOrderRow[] {
  const out: MarketOrderRow[] = [];
  for (const r of rows) {
    const itemId = toInt(r.item_id);
    if (itemId == null) continue;
    out.push({
      entityId: idStr(r.entity_id),
      region,
      side,
      itemId,
      itemType: toInt(r.item_type) ?? 0,
      claimEntityId: idStr(r.claim_entity_id),
      ownerEntityId: idStr(r.owner_entity_id),
      price: toInt(r.price_threshold) ?? 0,
      quantity: toInt(r.quantity) ?? 0,
      storedCoins: toInt(r.stored_coins) ?? 0,
      timestamp: toInt(r.timestamp) ?? 0,
    });
  }
  return out;
}

/** Combine asks (sell_order_state) + bids (buy_order_state) into one order list. */
export function mapMarketOrders(sellRows: Raw[], buyRows: Raw[], region: string): MarketOrderRow[] {
  return [...mapOrderSide(sellRows, "sell", region), ...mapOrderSide(buyRows, "buy", region)];
}

export interface MarketplaceRow {
  buildingEntityId: string;
  claimEntityId: string;
  region: string;
}
export function mapMarketplaces(rows: Raw[], region: string): MarketplaceRow[] {
  const out: MarketplaceRow[] = [];
  for (const r of rows) {
    if (r.building_entity_id == null) continue;
    out.push({
      buildingEntityId: idStr(r.building_entity_id),
      claimEntityId: idStr(r.claim_entity_id),
      region,
    });
  }
  return out;
}

export interface MarketSaleRow {
  entityId: string;
  region: string;
  itemId: number;
  itemType: number;
  quantity: number;
  ownerEntityId: string;
  claimEntityId: string;
  timestamp: number;
}

/** Read an item_stack that may be a positional array [item_id, quantity, item_type, durability]
 *  or a keyed object {item_id, quantity, item_type}. Null if no item id. */
function readStack(stack: unknown): { itemId: number; quantity: number; itemType: number } | null {
  if (Array.isArray(stack)) {
    const itemId = toInt(stack[0]);
    if (itemId == null) return null;
    return { itemId, quantity: toInt(stack[1]) ?? 0, itemType: toInt(stack[2]) ?? 0 };
  }
  if (stack && typeof stack === "object") {
    const o = stack as Raw;
    const itemId = toInt(o.item_id);
    if (itemId == null) return null;
    return { itemId, quantity: toInt(o.quantity) ?? 0, itemType: toInt(o.item_type) ?? 0 };
  }
  return null;
}

/** Map closed_listing_state → sales (item + qty + when; NO price exists in the source). */
export function mapClosedListings(rows: Raw[], region: string): MarketSaleRow[] {
  const out: MarketSaleRow[] = [];
  for (const r of rows) {
    const stack = readStack(r.item_stack);
    if (!stack) continue;
    out.push({
      entityId: idStr(r.entity_id),
      region,
      itemId: stack.itemId,
      itemType: stack.itemType,
      quantity: stack.quantity,
      ownerEntityId: idStr(r.owner_entity_id),
      claimEntityId: idStr(r.claim_entity_id),
      timestamp: toInt(r.timestamp) ?? 0,
    });
  }
  return out;
}
