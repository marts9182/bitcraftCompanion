# Region Event Countdown Banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a site-wide dismissible banner counting down to the next Hexite Sealed Vault world event (soonest of temp regions 3/11/15/23), with the region and a link to its location on the map.

**Architecture:** The worker reads the server-authoritative next-event time from the PUBLIC `growth_state` table (`growth_recipe_id = 1633012503`) and the chest location from `location_state`, upserting one row per region into a new Neon `region_events` table. A root-layout server component reads the soonest upcoming event (cached, tag-flushed by the worker) and renders a client countdown ticker.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres/Neon), Next.js 16 (App Router, `unstable_cache` + `revalidateTag`), SpacetimeDB read-only subscribe (existing `ws-snapshot`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-region-event-banner-design.md`

## File Structure

- Create `packages/shared/src/ingest/region-events.ts` — constants, `RegionEventRow` type, timestamp decode, `mapRegionEvent` (pure).
- Create `packages/shared/src/ingest/region-events.test.ts` — mapper + timestamp tests.
- Modify `packages/shared/src/ingest/column-orders.ts` — add `growth_state`, `location_state`.
- Modify `packages/shared/src/db/schema.ts` — add `regionEvents` table.
- Modify `packages/shared/src/index.ts` — export the new module.
- Create migration via `db:generate` under `packages/shared/drizzle/`.
- Modify `apps/worker/src/leaderboard-snapshot.ts` — add the temp-region event pass.
- Modify `apps/web/app/api/revalidate/route.ts` — flush the `region-events` tag.
- Create `apps/web/lib/queries/region-events.ts` — cached `getNextRegionEvent` + pure `pickNextEvent`.
- Create `apps/web/lib/queries/region-events.test.ts` — `pickNextEvent` tests.
- Create `apps/web/lib/use-now-second.ts` — per-second ticker hook.
- Modify `apps/web/lib/format.ts` — add `formatCountdown`; extend `format.test.ts`.
- Create `apps/web/components/EventBanner.tsx` (server) + `apps/web/components/EventCountdown.tsx` (client).
- Modify `apps/web/app/layout.tsx` — mount `<EventBanner/>` above `<SiteHeader/>`.

---

### Task 1: (Optional spike) Confirm growth-row shape around an active event

**Files:** none committed (throwaway script).

- [ ] **Step 1: Read sealed-chest growth across all 4 temp regions**

Create `apps/worker/src/_spike-events.ts` (delete after):

```ts
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });
import { parseServerEnv } from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";

const HEXITE = 1633012503;
const MODULES = ["bitcraft-live-3", "bitcraft-live-11", "bitcraft-live-15", "bitcraft-live-23"];

async function main() {
  const env = parseServerEnv();
  for (const moduleName of MODULES) {
    try {
      const t = await readSnapshot(
        { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN, moduleName },
        [`SELECT * FROM growth_state WHERE growth_recipe_id = ${HEXITE}`],
        ["growth_state"], 15000,
      );
      const rows = t.get("growth_state") ?? [];
      console.log(`${moduleName}: ${rows.length} row(s) ->`, JSON.stringify(rows).slice(0, 400));
    } catch (e) { console.log(`${moduleName}: ERR ${String(e)}`); }
  }
  process.exit(0);
}
main();
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @bcc/worker exec tsx src/_spike-events.ts`
Expected: each region prints 0–N rows. Note: are there ≥1 FUTURE `end_timestamp` rows per region, or only one? Does an active event show 0 rows (chest spawned, growth gone)? Record the answer in the spec's History section.

- [ ] **Step 3: Delete the spike**

```bash
rm apps/worker/src/_spike-events.ts
```

The mapper (Task 3) selects the soonest **future** row and the web layer (Task 7) treats a just-passed time as "live", so the implementation is correct regardless; this spike only confirms expectations.

---

### Task 2: `region_events` schema + migration

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Create: migration under `packages/shared/drizzle/`

- [ ] **Step 1: Add the table**

In `packages/shared/src/db/schema.ts`, near the other tables (ensure `primaryKey`, `integer`, `text`, `timestamp` are already imported — they are, used by `playerSkills`/`players`):

```ts
export const regionEvents = pgTable(
  "region_events",
  {
    region: text("region").notNull(),
    eventType: text("event_type").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    entityId: text("entity_id").notNull(),
    x: integer("x"),
    z: integer("z"),
    dimension: integer("dimension"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.region, t.eventType] }),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @bcc/shared db:generate`
Expected: a new `packages/shared/drizzle/00NN_*.sql` creating `region_events` + a snapshot under `meta/`. Open the `.sql` to confirm it only `CREATE TABLE "region_events"` (no destructive statements).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle
git commit -m "feat(db): region_events table for world-event banner"
```

> **Pre-merge note (record in the spec checklist):** `db:push` is broken in this repo — apply the generated `region_events` SQL to Neon **manually** before merge (same step as migrations 0014/0015).

---

### Task 3: Shared mapper + constants (TDD)

**Files:**
- Create: `packages/shared/src/ingest/region-events.ts`
- Test: `packages/shared/src/ingest/region-events.test.ts`
- Modify: `packages/shared/src/ingest/column-orders.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/ingest/region-events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapRegionEvent, spacetimeMicrosToDate, HEXITE_SEALED_VAULT } from "./region-events";

describe("spacetimeMicrosToDate", () => {
  it("decodes the Timestamp product shape (micros since epoch)", () => {
    const d = spacetimeMicrosToDate({ __timestamp_micros_since_unix_epoch__: "1781593223181548" });
    expect(d?.getTime()).toBe(1781593223181); // micros -> ms (floored)
  });
  it("accepts a raw numeric micros value and rejects junk", () => {
    expect(spacetimeMicrosToDate(1781593223181548)?.getTime()).toBe(1781593223181);
    expect(spacetimeMicrosToDate(null)).toBeNull();
    expect(spacetimeMicrosToDate("nope")).toBeNull();
  });
});

describe("mapRegionEvent", () => {
  const growth = [
    { entity_id: "216172782117381329", end_timestamp: { __timestamp_micros_since_unix_epoch__: "1781593223181548" }, growth_recipe_id: 1633012503 },
    { entity_id: "999", end_timestamp: { __timestamp_micros_since_unix_epoch__: "1781600000000000" }, growth_recipe_id: 1633012503 },
  ];
  const location = [{ entity_id: "216172782117381329", chunk_index: 43204, x: 19492, z: 4134, dimension: 1 }];

  it("picks the soonest growth and joins its location", () => {
    const r = mapRegionEvent(growth, location, "3");
    expect(r).toEqual({
      region: "3",
      eventType: HEXITE_SEALED_VAULT,
      endsAt: new Date(1781593223181),
      entityId: "216172782117381329",
      x: 19492,
      z: 4134,
      dimension: 1,
    });
  });

  it("returns coords null when no location row matches, but still maps the time", () => {
    const r = mapRegionEvent(growth, [], "3");
    expect(r?.x).toBeNull();
    expect(r?.endsAt).toEqual(new Date(1781593223181));
  });

  it("returns null when there are no growth rows", () => {
    expect(mapRegionEvent([], location, "3")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/ingest/region-events.test.ts`
Expected: FAIL — module `./region-events` not found.

- [ ] **Step 3: Implement the mapper**

`packages/shared/src/ingest/region-events.ts`:

```ts
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
  let micros: bigint | null = null;
  if (ts && typeof ts === "object" && "__timestamp_micros_since_unix_epoch__" in ts) {
    micros = toBigInt((ts as Record<string, unknown>)["__timestamp_micros_since_unix_epoch__"]);
  } else {
    micros = toBigInt(ts);
  }
  if (micros === null) return null;
  return new Date(Number(micros / 1000n));
}

function toBigInt(v: unknown): bigint | null {
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "bigint") return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
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
```

- [ ] **Step 4: Add COLUMN_ORDERS entries**

In `packages/shared/src/ingest/column-orders.ts`, add inside the object (column orders verified against the live `bitcraft-live-3` schema):

```ts
  growth_state: ["entity_id", "end_timestamp", "growth_recipe_id"],
  location_state: ["entity_id", "chunk_index", "x", "z", "dimension"],
```

- [ ] **Step 5: Export from the shared index**

In `packages/shared/src/index.ts`, add alongside the other ingest exports:

```ts
export * from "./ingest/region-events";
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm vitest run packages/shared/src/ingest/region-events.test.ts`
Expected: PASS (3 + 2 assertions green).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ingest/region-events.ts packages/shared/src/ingest/region-events.test.ts packages/shared/src/ingest/column-orders.ts packages/shared/src/index.ts
git commit -m "feat(shared): region-event mapper + sealed-vault constants"
```

---

### Task 4: Worker pass — read & upsert the next event per temp region

**Files:**
- Modify: `apps/worker/src/leaderboard-snapshot.ts`

- [ ] **Step 1: Import the helpers**

In the `@bcc/shared` import block at the top of `leaderboard-snapshot.ts`, add:

```ts
  mapRegionEvent, TEMP_REGION_MODULES, HEXITE_SEALED_VAULT_GROWTH_ID,
```

- [ ] **Step 2: Add the event pass before the final `triggerRevalidate`**

Insert this block just before the `await db.update(schema.ingestionRuns)...status: "ok"` line near the end of `main()`:

```ts
    // ── Temp-region world events: read the server-authoritative next-event time ──
    // The Hexite Sealed Vault is a growth_state entity; its end_timestamp (PUBLIC)
    // is exactly when the event fires. Coords come from location_state. One tiny
    // filtered read per temp module; upsert one row per region.
    let eventsWritten = 0;
    for (const moduleName of TEMP_REGION_MODULES) {
      const region = moduleName.match(/(\d+)$/)?.[1] ?? moduleName;
      try {
        const gr = await readSnapshot(
          { ...conn, moduleName },
          [`SELECT * FROM growth_state WHERE growth_recipe_id = ${HEXITE_SEALED_VAULT_GROWTH_ID}`],
          ["growth_state"],
          20_000,
        );
        const growthRows = norm(gr, "growth_state");
        const ids = growthRows.map((r) => String(r.entity_id)).filter(Boolean);
        let locationRows: Record<string, unknown>[] = [];
        if (ids.length) {
          const lr = await readSnapshot(
            { ...conn, moduleName },
            [`SELECT * FROM location_state WHERE entity_id IN (${ids.join(",")})`],
            ["location_state"],
            20_000,
          );
          locationRows = norm(lr, "location_state");
        }
        const event = mapRegionEvent(growthRows, locationRows, region);
        if (event) {
          await db
            .insert(schema.regionEvents)
            .values({ ...event })
            .onConflictDoUpdate({
              target: [schema.regionEvents.region, schema.regionEvents.eventType],
              set: {
                endsAt: event.endsAt, entityId: event.entityId,
                x: event.x, z: event.z, dimension: event.dimension, updatedAt: new Date(),
              },
            });
          eventsWritten++;
        }
        console.log(`[lb-snapshot]   temp region ${region}: ${growthRows.length} growth row(s)${event ? ` -> ends ${event.endsAt.toISOString()}` : ""}`);
      } catch (err) {
        console.warn(`[lb-snapshot]   temp region ${region} (${moduleName}) event read skipped:`, String(err));
      }
    }
    console.log(`[lb-snapshot] region events: ${eventsWritten}/${TEMP_REGION_MODULES.length} regions have an upcoming vault`);
```

- [ ] **Step 3: Typecheck the worker**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/leaderboard-snapshot.ts
git commit -m "feat(worker): record next Hexite Sealed Vault per temp region"
```

---

### Task 5: Flush the `region-events` cache tag on ingestion

**Files:**
- Modify: `apps/web/app/api/revalidate/route.ts`

- [ ] **Step 1: Add the tag flush**

In the `if (body.all)` block, alongside the existing `revalidateTag(...)` calls:

```ts
    revalidateTag("region-events", "max");
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/revalidate/route.ts
git commit -m "feat(web): flush region-events tag on ingestion revalidate"
```

---

### Task 6: Web query — cached read + pure selection (TDD)

**Files:**
- Create: `apps/web/lib/queries/region-events.ts`
- Test: `apps/web/lib/queries/region-events.test.ts`

- [ ] **Step 1: Write the failing test (pure selection only)**

`apps/web/lib/queries/region-events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickNextEvent, type StoredEvent } from "./region-events";

const base: StoredEvent = { region: "3", eventType: "hexite_sealed_vault", endsAt: new Date(0), x: 19492, z: 4134, dimension: 1 };
const at = (iso: string, region: string): StoredEvent => ({ ...base, region, endsAt: new Date(iso) });
const NOW = Date.parse("2026-06-15T12:00:00Z");

describe("pickNextEvent", () => {
  it("returns the soonest FUTURE event across regions as 'upcoming'", () => {
    const rows = [at("2026-06-15T20:00:00Z", "11"), at("2026-06-15T14:00:00Z", "3"), at("2026-06-16T02:00:00Z", "15")];
    const r = pickNextEvent(rows, NOW);
    expect(r?.region).toBe("3");
    expect(r?.state).toBe("upcoming");
  });

  it("treats a just-passed event (within the live window) as 'live'", () => {
    const r = pickNextEvent([at("2026-06-15T11:50:00Z", "3")], NOW);
    expect(r?.state).toBe("live");
  });

  it("ignores events older than the live window", () => {
    expect(pickNextEvent([at("2026-06-15T10:00:00Z", "3")], NOW)).toBeNull();
  });

  it("prefers an upcoming event over a live one when both exist", () => {
    const r = pickNextEvent([at("2026-06-15T11:55:00Z", "3"), at("2026-06-15T18:00:00Z", "11")], NOW);
    expect(r?.region).toBe("11");
    expect(r?.state).toBe("upcoming");
  });

  it("returns null for an empty set", () => {
    expect(pickNextEvent([], NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/web/lib/queries/region-events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement query + selection**

`apps/web/lib/queries/region-events.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run apps/web/lib/queries/region-events.test.ts`
Expected: PASS (5 assertions green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/region-events.ts apps/web/lib/queries/region-events.test.ts
git commit -m "feat(web): cached region-events read + next-event selection"
```

---

### Task 7: Per-second ticker hook

**Files:**
- Create: `apps/web/lib/use-now-second.ts`

- [ ] **Step 1: Implement (mirror of use-now-minute at 1s)**

`apps/web/lib/use-now-second.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

// Per-second "now" ticker as an external store (one shared interval, runs only
// while subscribed). Mirrors use-now-minute.ts but at 1s for live countdowns.
let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  nowMs = Date.now();
  timer ??= setInterval(() => {
    nowMs = Date.now();
    listeners.forEach((l) => l());
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Second-granularity "now" on the client; null during SSR/hydration. */
export function useNowSecond(): number | null {
  return useSyncExternalStore<number | null>(subscribe, () => nowMs, () => null);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/use-now-second.ts
git commit -m "feat(web): per-second ticker hook for countdowns"
```

---

### Task 8: Countdown formatter (TDD)

**Files:**
- Modify: `apps/web/lib/format.ts`, `apps/web/lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/format.test.ts`:

```ts
import { formatCountdown } from "./format";

describe("formatCountdown", () => {
  it("formats H:MM:SS for sub-day durations", () => {
    expect(formatCountdown(4 * 3600_000 + 23 * 60_000 + 17_000)).toBe("4:23:17");
  });
  it("includes days when >= 24h", () => {
    expect(formatCountdown(25 * 3600_000 + 60_000 + 5_000)).toBe("1d 1:01:05");
  });
  it("clamps negatives to zero", () => {
    expect(formatCountdown(-5000)).toBe("0:00:00");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/web/lib/format.test.ts`
Expected: FAIL — `formatCountdown` not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/format.ts`:

```ts
/** "4:23:17" or "1d 1:01:05"; clamps negative to "0:00:00". */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hms = `${h}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}d ${hms}` : hms;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run apps/web/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/format.ts apps/web/lib/format.test.ts
git commit -m "feat(web): formatCountdown helper"
```

---

### Task 9: Banner components + layout mount

**Files:**
- Create: `apps/web/components/EventCountdown.tsx` (client), `apps/web/components/EventBanner.tsx` (server)
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Client countdown + dismiss**

`apps/web/components/EventCountdown.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useNowSecond } from "@/lib/use-now-second";
import { useHydrated } from "@/lib/use-hydrated";
import { formatCountdown, formatGameCoords } from "@/lib/format";

export interface EventBannerData {
  region: string;
  endsAtMs: number;
  state: "upcoming" | "live";
  x: number | null;
  z: number | null;
}

export function EventCountdown({ data }: { data: EventBannerData }) {
  const hydrated = useHydrated();
  const nowMs = useNowSecond() ?? data.endsAtMs;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const key = `evt-dismiss-${data.region}-${data.endsAtMs}`;
  // Hide if the user dismissed THIS occurrence (re-appears for the next one).
  const dismissed = hydrated && (dismissedKey === key || (typeof localStorage !== "undefined" && localStorage.getItem(key) === "1"));
  if (dismissed) return null;

  const coords = data.x != null && data.z != null ? formatGameCoords(data.x, data.z) : null;
  // Deep-link to the region on the map; pass coords so the map can pin them.
  const mapHref = coords
    ? `/map?regions=${data.region}&ev=${data.x},${data.z}`
    : `/map?regions=${data.region}`;

  const remaining = data.endsAtMs - nowMs;
  const label = data.state === "live" || remaining <= 0
    ? `Happening now in Region ${data.region}`
    : `Next Hexite Vault · Region ${data.region} · in ${formatCountdown(remaining)}`;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-border bg-primary/10 px-4 py-1.5 text-sm">
      <span aria-hidden>⚡</span>
      <span className="font-medium">{label}</span>
      <Link href={mapHref} className="underline underline-offset-2 hover:text-primary">
        📍 {coords ? `${coords} · ` : ""}View on map
      </Link>
      <button
        type="button"
        aria-label="Dismiss event banner"
        className="ml-2 text-muted-foreground hover:text-foreground"
        onClick={() => { try { localStorage.setItem(key, "1"); } catch {} setDismissedKey(key); }}
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Server banner (reads the query)**

`apps/web/components/EventBanner.tsx`:

```tsx
import { getRegionEvents, pickNextEvent } from "@/lib/queries/region-events";
import { EventCountdown } from "./EventCountdown";

/** Site-wide banner: soonest Hexite Sealed Vault across temp regions. Renders
 * nothing when there is no upcoming/live event (e.g. after Aug 20). */
export async function EventBanner() {
  const rows = await getRegionEvents();
  const next = pickNextEvent(rows, Date.now());
  if (!next) return null;
  return (
    <EventCountdown
      data={{ region: next.region, endsAtMs: next.endsAt.getTime(), state: next.state, x: next.x, z: next.z }}
    />
  );
}
```

- [ ] **Step 3: Mount in the root layout**

In `apps/web/app/layout.tsx`: add the import and render it above `<SiteHeader/>`.

```tsx
import { EventBanner } from "@/components/EventBanner";
```

```tsx
        <ThemeProvider>
          <EventBanner />
          <SiteHeader />
          {children}
          <SiteFooter />
        </ThemeProvider>
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter @bcc/web typecheck && pnpm --filter @bcc/web lint`
Expected: PASS. (Confirm `useHydrated` is exported from `@/lib/use-hydrated`; it is, used by ThemeToggle/MobileNav.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/EventBanner.tsx apps/web/components/EventCountdown.tsx apps/web/app/layout.tsx
git commit -m "feat(web): site-wide Hexite Sealed Vault countdown banner"
```

---

### Task 10: Verify end-to-end against the live DB

**Files:** none (verification).

- [ ] **Step 1: Run the worker event pass once to populate `region_events`**

Run: `pnpm --filter @bcc/worker exec tsx src/leaderboard-snapshot.ts` (requires `.env.local`).
Expected: log lines `temp region 3/11/15/23: N growth row(s) -> ends <ISO>` and `region events: N/4 regions have an upcoming vault`. (If running the full snapshot is too heavy locally, temporarily guard the other passes, or trust the per-region logs.)

- [ ] **Step 2: Confirm rows landed**

Query Neon (or add a one-off `console.table`): `SELECT * FROM region_events;`
Expected: up to 4 rows with future `ends_at` + coords.

- [ ] **Step 3: Start the web app and look at the banner**

Run: `pnpm --filter @bcc/web dev`, open `http://localhost:3000/`.
Expected: a thin strip above the header: "⚡ Next Hexite Vault · Region {n} · in H:MM:SS · 📍 N…, E… · View on map ✕", counting down each second. Click "View on map" → `/map?regions={n}&ev=x,z`. Click ✕ → banner disappears; reload → stays gone for that occurrence.

- [ ] **Step 4: Full gates**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm vitest run && pnpm --filter @bcc/web build`
Expected: all green.

---

### Task 11 (follow-up, optional): precise map centering on the event

The banner already links to `/map?regions={region}&ev={x},{z}` and shows the N/E coords. This task makes the map *center + drop a marker* on `ev`.

**Files:** Modify `apps/web/app/map/page.tsx` (parse `ev`), `apps/web/components/map/MapClient.tsx` (center + temporary marker).

- [ ] **Step 1:** Read `MapClient.tsx` to learn the existing small-hex → Leaflet latlng conversion used for resource dots; reuse it.
- [ ] **Step 2:** Parse `ev=x,z` in `map/page.tsx`, pass `initialEvent={{x,z}}` to `MapClient`.
- [ ] **Step 3:** In `MapClient`, when `initialEvent` is set, convert to latlng, `setView` there at a close zoom, and render a highlighted marker.
- [ ] **Step 4:** Typecheck, lint, manual check, commit.

> Deferred because it requires the map's internal coordinate transform; v1 satisfies "link to the coords" via the region deep-link + visible N/E coords. Also relates to the separate **backlog item**: resource dots render one square too far left (shift +1 east) — fix that coordinate offset in the same pass, since both touch the small-hex→pixel mapping.

---

## Self-Review

**Spec coverage:** event identity + temp regions (Tasks 3/4 constants) ✓; public `growth_state.end_timestamp` source (Task 4) ✓; `region_events` storage (Task 2) ✓; worker detection/coords (Task 4) ✓; soonest-only selection + live + auto-hide (Task 6) ✓; dismissible banner above header + countdown + map link (Tasks 7–9) ✓; revalidation (Task 5) ✓; testing (Tasks 3/6/8) ✓; Aug-20 auto-hide = no future rows → `pickNextEvent` returns null (Task 6) ✓.

**Placeholder scan:** no TBDs; every code step has complete code. Task 1 and Task 11 are explicitly optional/follow-up, not placeholders.

**Type consistency:** `RegionEventRow` (shared) → `schema.regionEvents` columns (region, eventType, endsAt, entityId, x, z, dimension) match; `StoredEvent`/`NextEvent` (web) → `EventBannerData` (client) fields match; `mapRegionEvent`, `pickNextEvent`, `getRegionEvents`, `useNowSecond`, `formatCountdown` names used consistently across tasks.
