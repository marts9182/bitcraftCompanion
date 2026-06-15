# Region Event Countdown Banner — Design

**Date:** 2026-06-15
**Status:** Approved design, pending spec review
**Approach:** Direct read of the server-authoritative event time from a public table
(supersedes the earlier "observe-and-predict" Approach A — see History).

## Goal

Show a site-wide banner counting down to the **next Hexite Sealed Vault** world event
in BitCraft's temporary regions, with the region and a link to its location on our map.

## Background — what the event is (verified)

- BitCraft EA2 added **4 temporary regions** ("Uncharted Islands"): **R3, R11, R15, R23**,
  live **June 11 → Aug 20 2026**, after which players are relocated and the regions cleared.
- Each region runs a **Hexite Sealed Vault** cooperative world event multiple times per day
  (owner observes ~6h spacing, with a longer gap across the day boundary), announced by
  world-wide system chat warnings. Rewards: Uncharted Doubloons + Trinkets.

## How the timing actually works (verified against the open-source server + live data)

BitCraft's server is open-source (`clockworklabs/BitCraftPublic`). The sealed chest is a
**`growth_state`** entity that "grows" until it activates:

- `growth_state.rs`: `INACTIVE_HEXITE_SEALED_CHEST_GROWTH_ID = 1633012503`; on creation
  `end_timestamp = ctx.timestamp + growth_duration`. The server schedules the system-chat
  warnings at `end_timestamp − 1h / − 15m / − 5m`.
- **`growth_state` is a PUBLIC table** — confirmed via the live schema and a filtered read.
  Columns: `entity_id:u64, end_timestamp:Timestamp, growth_recipe_id:i32`.

**Confirmed live (region 3, 2026-06-15):**
```
SELECT * FROM growth_state WHERE growth_recipe_id = 1633012503
→ { entity_id: 216172782117381329,
    end_timestamp: 1781593223181548 µs  (≈ 2026-06-16 ~07:00 UTC),
    growth_recipe_id: 1633012503 }
SELECT * FROM location_state WHERE entity_id = 216172782117381329
→ { x: 19492, z: 4134, dimension: 1 }   (→ N1378, E6497 via formatGameCoords ÷3)
```

⇒ The exact next-event time is the **server-scheduled `end_timestamp`**, readable from a
public table with our existing read-only dev-token connection. **No prediction, no interval
modeling, no warmup.** This is how accurate community sites do it: they read the authoritative
completion time, not a guessed cadence. The private `sytem_chat_broadcast_timer` (unreadable
with any token we can hold) only fires the chat warnings — irrelevant to us.

## Architecture

Three units, each independently testable.

### 1. Storage — `region_events` table (Neon / Drizzle)

Holds the **current next event per region** (one upserted row per region+type, not history):

| column        | type              | notes                                                  |
|---------------|-------------------|--------------------------------------------------------|
| `region`      | text (PK part)    | `"3" | "11" | "15" | "23"`                              |
| `event_type`  | text (PK part)    | `"hexite_sealed_vault"` (extensible)                   |
| `ends_at`     | timestamp (UTC)   | the growth `end_timestamp` = when the event fires      |
| `entity_id`   | text              | growth entity (for dedupe / debugging)                 |
| `x`, `z`      | integer, nullable | small-hex coords from `location_state`                 |
| `dimension`   | integer, nullable | from `location_state` (overworld = 1)                  |
| `updated_at`  | timestamp         | last worker refresh                                    |

- Primary key `(region, event_type)` → each worker run **upserts** the current next event.
- New Drizzle migration. `db:push` is known-broken here → apply generated SQL to Neon directly
  (same pre-merge step as migrations 0014/0015).

### 2. Worker stage — read the authoritative time (extends the 30-min cron)

- Read-only connect to each temp-region module `bitcraft-live-{3,11,15,23}` (new
  `TEMP_REGION_MODULES` constant; reuses the existing `ws-snapshot` read-only path, no reducers).
- Per region, subscribe with filters (tiny payloads):
  - `SELECT * FROM growth_state WHERE growth_recipe_id = 1633012503` → soonest future `end_timestamp` + `entity_id`.
  - `SELECT * FROM location_state WHERE entity_id = <that entity>` → `x, z, dimension`.
- Upsert one `region_events` row per region; `revalidateTag("region-events")` after writes
  (same pattern as the `ingestion-time` tag) so the banner refreshes.
- If no sealed-chest growth row exists for a region (event currently active, or none queued),
  leave the prior row and mark staleness via `ends_at < now`; the web layer treats a just-passed
  `ends_at` as "live" until the next growth appears.
- **Spike note (small):** confirm how many growth rows exist per region at once (one queued vs.
  several) so we pick the soonest correctly, and confirm behaviour during the active window.
  This is a data-shape check, not an architecture risk.

### 3. Web — selection + banner

- **Selection (shared, pure):** read the 4 rows, drop expired/cleared, pick the **soonest
  future `ends_at`** ("soonest only", owner's choice). If the soonest `ends_at` is in the past
  but within the event's active window → state `live`. If none / all past Aug 20 → state `none`.
- **Banner (server component in root layout):** a thin **dismissible** strip directly **above
  the sticky `SiteHeader`**, showing the soonest vault:
  `⚡ Next Hexite Vault · Region {n} · in HH:MM:SS · 📍 View on map ✕`
  - Countdown is a small **client** ticker at second resolution (reuse the existing
    `useNowMinute`-style hook pattern, ticking per-second).
  - "View on map" deep-links into the existing map at the coords (builds on the shipped
    clickable-coords / `formatGameCoords` work). Coords unknown → link to the region, no pin.
  - Dismiss is client-side (localStorage keyed by `region+ends_at`) → reappears for the next event.
  - `live` state swaps the countdown for "Happening now in Region {n}".

## Data flow

```
SpacetimeDB temp modules · PUBLIC growth_state (+ location_state)
        │  worker cron (read-only, filtered subscribe)
        ▼
  next ends_at + coords per region
        │  upsert
        ▼
  Neon region_events ──revalidateTag("region-events")──▶ web
        │  pick soonest future
        ▼
  <EventBanner/> (server) → <Countdown/> (client ticker) → map deep-link
```

## Error handling / edge cases

- Worker can't reach a module this run → keep prior row; banner shows last known time.
- `ends_at` passes with no fresh growth row → `live` ("Happening now"), then flips to next once
  the worker records the new growth.
- Coords unresolved → still show countdown; map link falls back to region view.
- Post Aug 20 / no rows → banner renders nothing (no layout shift).
- Timezone: countdown is relative (HH:MM:SS); also show absolute local time on hover/secondary.

## Testing

- **Selection lib (vitest, pure):** soonest-future across regions, live-window, expiry/auto-hide,
  all-expired → none.
- **Mapper (vitest):** SpacetimeDB `Timestamp` (µs) → JS Date; growth+location rows → a
  `region_events` record (region, ends_at, coords, dimension). Covers the µs-timestamp + coord
  decode explicitly (known SpacetimeDB gotchas).
- **Banner/countdown:** light component test for countdown / live / hidden states.
- Follows existing query/test conventions in `apps/web/lib` and the worker mappers.

## Out of scope (YAGNI)

- A full events history/all-regions view (banner is soonest-only; a richer page can come later).
- Push/Discord notifications.
- Event types beyond the Hexite Sealed Vault (schema is extensible via `event_type`).
- Reading the private broadcast timer (impossible with any token we can hold; unnecessary —
  `growth_state.end_timestamp` is authoritative).

## History

- Original plan was **Approach A: observe occurrences via chat/loot_chest and predict the next
  from a learned interval** (needed a ~1-day warmup, approximate). Superseded once the
  open-source server revealed the chest is a `growth_state` whose **public `end_timestamp`** is
  the authoritative scheduled time — directly readable, exact, no warmup. The owner's reference
  to "sites that have this accurately" is explained: they read `growth_state.end_timestamp`.
