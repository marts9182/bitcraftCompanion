import "server-only";
import { unstable_cache } from "next/cache";
import { getDb, schema } from "@/lib/db";

export interface StoredEvent {
  region: string;
  eventType: string;
  endsAt: Date;
  x: number | null;
  z: number | null;
  dimension: number | null;
}

export interface NextEvent extends StoredEvent {
  state: "upcoming" | "live";
}

/** A vault stays "live" for this long after its end_timestamp (cooperative
 * window) before we stop showing it, in case the next growth row hasn't landed. */
export const LIVE_WINDOW_MS = 30 * 60 * 1000;

/** Pure: choose what the banner shows. Prefer the soonest UPCOMING event; if
 * none upcoming, show a recently-passed one as "live"; else nothing. */
export function pickNextEvent(rows: StoredEvent[], nowMs: number): NextEvent | null {
  const upcoming = rows
    .filter((r) => r.endsAt.getTime() > nowMs)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  if (upcoming[0]) return { ...upcoming[0], state: "upcoming" };

  const live = rows
    .filter((r) => r.endsAt.getTime() <= nowMs && nowMs - r.endsAt.getTime() <= LIVE_WINDOW_MS)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  if (live[0]) return { ...live[0], state: "live" };
  return null;
}

/** Cached read of all stored region events (4 rows max). Tag-flushed by the
 * worker after each snapshot. Never throws — a banner must not take a page down. */
export const getRegionEvents = unstable_cache(
  async (): Promise<StoredEvent[]> => {
    try {
      return await getDb()
        .select({
          region: schema.regionEvents.region,
          eventType: schema.regionEvents.eventType,
          endsAt: schema.regionEvents.endsAt,
          x: schema.regionEvents.x,
          z: schema.regionEvents.z,
          dimension: schema.regionEvents.dimension,
        })
        .from(schema.regionEvents);
    } catch (err) {
      console.error("[region-events] read failed:", err);
      return [];
    }
  },
  ["region-events"],
  { revalidate: 1800, tags: ["region-events"] },
);
