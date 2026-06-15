/** The growth recipe id the BitCraft server uses for the inactive Hexite Sealed
 * Chest (open-source: growth_state.rs INACTIVE_HEXITE_SEALED_CHEST_GROWTH_ID). */
export const HEXITE_SEALED_VAULT_GROWTH_ID = 1633012503;
export const HEXITE_SEALED_VAULT = "hexite_sealed_vault";

/** Region modules that host temp-region world events (Uncharted Islands). */
export const TEMP_REGION_MODULES = [
  "bitcraft-live-3",
  "bitcraft-live-11",
  "bitcraft-live-15",
  "bitcraft-live-23",
];

export interface RegionEventRow {
  region: string;
  eventType: string;
  endsAt: Date;
  entityId: string;
  x: number | null;
  z: number | null;
  dimension: number | null;
}

/** SpacetimeDB Timestamp -> Date. Accepts the product shape
 * `{__timestamp_micros_since_unix_epoch__: "..."}`, a raw number, or a numeric
 * string (all micros since epoch). Returns null for anything else. */
export function spacetimeMicrosToDate(ts: unknown): Date | null {
  const raw =
    ts && typeof ts === "object" && "__timestamp_micros_since_unix_epoch__" in ts
      ? (ts as Record<string, unknown>)["__timestamp_micros_since_unix_epoch__"]
      : ts;
  const micros = toMicros(raw);
  if (micros === null) return null;
  return new Date(Math.floor(micros / 1000));
}

// Micros since epoch as a JS number. Safe past year 2255 (< 2^53 µs), far beyond
// any game timestamp — so no BigInt (the web app's tsconfig targets < ES2020 and
// rejects BigInt literals when it compiles this shared source).
function toMicros(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Build the current next-event record for a region from sealed-chest growth +
 * location rows. Picks the soonest valid `end_timestamp`. Returns null if there
 * is no growth row (caller leaves the prior row untouched). */
export function mapRegionEvent(
  growthRows: Record<string, unknown>[],
  locationRows: Record<string, unknown>[],
  region: string,
  eventType: string = HEXITE_SEALED_VAULT,
): RegionEventRow | null {
  const dated = growthRows
    .map((r) => ({ entityId: String(r.entity_id), endsAt: spacetimeMicrosToDate(r.end_timestamp) }))
    .filter((r): r is { entityId: string; endsAt: Date } => r.endsAt !== null && !!r.entityId)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  const soonest = dated[0];
  if (!soonest) return null;

  const loc = locationRows.find((l) => String(l.entity_id) === soonest.entityId);
  return {
    region,
    eventType,
    endsAt: soonest.endsAt,
    entityId: soonest.entityId,
    x: loc ? num(loc.x) : null,
    z: loc ? num(loc.z) : null,
    dimension: loc ? num(loc.dimension) : null,
  };
}
