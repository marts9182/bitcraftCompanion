import { toInt } from "./decode";
import { decodeLocationSum } from "../world/coords";

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

/** A SpacetimeDB Timestamp serializes as { __timestamp_micros_since_unix_epoch__: "<i64>" }
 *  in the v1.json protocol; older/other fields may already be plain numbers. Returns
 *  microseconds since the Unix epoch as a number (0 if absent/unparseable). */
export function decodeTimestampMicros(v: unknown): number {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return toInt((v as Record<string, unknown>).__timestamp_micros_since_unix_epoch__) ?? 0;
  }
  return toInt(v) ?? 0;
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
      timestamp: decodeTimestampMicros(r.timestamp),
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
  /** Small-hex world coords from marketplace_state.location (null when undecodable). */
  x: number | null;
  z: number | null;
}
export function mapMarketplaces(rows: Raw[], region: string): MarketplaceRow[] {
  const out: MarketplaceRow[] = [];
  for (const r of rows) {
    if (r.building_entity_id == null) continue;
    const loc = decodeLocationSum(r.location);
    out.push({
      buildingEntityId: idStr(r.building_entity_id),
      claimEntityId: idStr(r.claim_entity_id),
      region,
      x: loc?.x ?? null,
      z: loc?.z ?? null,
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

/** Read item_id/quantity/item_type from an item_stack. item_type may be a tagged-enum
 *  array [tag,{}] (real closed_listing wire form) or a plain number. Null if no item id. */
function readStack(stack: unknown): { itemId: number; quantity: number; itemType: number } | null {
  const tag = (v: unknown): number => (Array.isArray(v) ? toInt(v[0]) ?? 0 : toInt(v) ?? 0);
  if (Array.isArray(stack)) {
    const itemId = toInt(stack[0]);
    if (itemId == null) return null;
    return { itemId, quantity: toInt(stack[1]) ?? 0, itemType: tag(stack[2]) };
  }
  if (stack && typeof stack === "object") {
    const o = stack as Record<string, unknown>;
    const itemId = toInt(o.item_id);
    if (itemId == null) return null;
    return { itemId, quantity: toInt(o.quantity) ?? 0, itemType: tag(o.item_type) };
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
      timestamp: decodeTimestampMicros(r.timestamp),
    });
  }
  return out;
}
