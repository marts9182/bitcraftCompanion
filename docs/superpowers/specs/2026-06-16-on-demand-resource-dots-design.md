# On-demand resource dots — design

**Date:** 2026-06-16
**Status:** Approved (design); pending implementation plan
**Supersedes:** the static-CDN resource-positions plan (jsDelivr + `bitcraftcompanion-map-data` repo + 6-hour cron + `MAP_DATA_PUSH_TOKEN`) — that approach is abandoned.

## Problem

The world-map resource finder shows spawn-position **dots** for a tracked resource. In production those dots 404: the ~403 MB of resource position data lives in `apps/web/public/map-data/` (gitignored) and was never hosted, so `NEXT_PUBLIC_MAP_DATA_BASE` is unset and the client falls back to `/map-data` (not deployed). Creature dots work (small, committed under `apps/web/public/map/enemies/`); only resource dots are missing.

Two owner requirements drove the redesign:
1. **Fresh data** — resource positions change as nodes are harvested/respawn ("updates often").
2. **Minimal impact on the live game server** — must not look like a DDoS.

## Why not the static-CDN approach

Static snapshots on jsDelivr are stale (CDN caches a branch ref up to ~7 days), require a 403 MB repo + a refresh cron + a PAT secret, and a 6-hour refresh both pulls the full 403 MB from the game every run and still wouldn't surface past the CDN cache without per-file purges. It optimizes for the wrong thing given the freshness + minimal-impact goals.

## Spike findings (live game, 4 small queries)

Connection recipe reused from `apps/worker/src/spacetime/ws-snapshot.ts` (`readSnapshot`): token exchange → `SubscribeMulti` → decode frame. Per-region module is `bitcraft-live-{N}`; regions are `7,8,9,12,13,14,17,18,19`.

| Query | Result |
| --- | --- |
| Single resource in one region (Ancient Oak id 23, r7) | 2,997 pts, 261 KiB, **900 ms** end-to-end |
| Largest resource (id 125, r17) | 581,078 pts, ~50 MB, **3.4 s** |
| `... WHERE resource_id = 125 LIMIT 5000` | **Rejected** — "Unsupported" |
| `... AND location_state.x BETWEEN ... AND location_state.z BETWEEN ...` (bbox) | **Rejected** — "Internal error evaluating queries" |

Conclusions:
- The single-resource-per-region JOIN is fast and reliable (the attributable case; the old multi-resource merge problem does not apply).
- All queries finish well under a ~10 s serverless timeout.
- The game offers **no source-side row capping** (no `LIMIT`, no bbox range filter). The only available query shape is "all points of resource R in region N." Mega-resources must therefore be downsampled **server-side, after** the pull.

## Architecture

On-demand, region-scoped, cached. The client requests one resource's points for one region; a Node-runtime route handler queries the live game (cache-miss only), downsamples if huge, and returns the same `{ xz }` contract the canvas layer already consumes.

```
finder selects resource
   └─> for each region in resource.spawnCounts (DB-backed), narrowed to the
       focused region when one is selected (selectedId):
          GET /api/map/resources/{region}/{id}
             └─> unstable_cache(region,id), revalidate 900s
                    └─> [cache miss] WS single-resource query to bitcraft-live-{region}
                           └─> trim to {x,z} flat array; grid-bucket to <= CAP if huge
                    └─> { xz, total, sampled }
   └─> existing ResourcePointsLayer renders dots (unchanged)
```

### Components

1. **Server-only WS query helper** — `apps/web/lib/spacetime/resource-points.ts`
   - Lean single-resource query adapted from `ws-snapshot.ts`: `exchangeToken` → open `v1.json` WS with `?token=&compression=None` → send one `SubscribeMulti` for
     `SELECT location_state.* FROM location_state JOIN resource_state ON location_state.entity_id = resource_state.entity_id WHERE resource_state.resource_id = {id}` →
     collect `location_state` rows from `SubscribeMultiApplied` → close.
   - Returns `{ xz: number[], total: number }` where `xz` is a flat small-hex `[x,z,x,z,...]` array (matching the client's current `{ xz }` parse).
   - Uses the tiny `ws` package + `node:zlib` only — **not** the `@clockworklabs/spacetimedb-sdk` (honors the "SDK out of the web bundle" rule). Server-only: imported solely by the route handler (Node runtime), never by a client component.
   - Adds `ws` + `@types/ws` to `apps/web` dependencies.

2. **Route handler** — `apps/web/app/api/map/resources/[region]/[id]/route.ts`
   - `export const runtime = "nodejs"`.
   - Validate: `region` is an integer in the known region set; `id` is a positive integer. Reject others with 400.
   - Wraps **query + downsample together** in `unstable_cache(fn, [region, id], { revalidate: 900 })` so the **downsampled** (small) result is what gets cached. This is required: Next's Data Cache rejects entries over ~2 MB, so caching the raw ~50 MB mega-resource set would silently fail to cache and re-pull the game every request. Downsampling inside the cache boundary keeps every entry small and preserves the once-per-window guarantee.
   - Returns `{ xz, total, sampled }` with `Cache-Control: public, s-maxage=900, stale-while-revalidate=3600` so Netlify's CDN absorbs most hits without invoking the function.

3. **Client swap** — `apps/web/lib/map/use-tracked-points.ts`
   - Change the resource fetch URL (currently `${DATA_BASE}/resources/r${region}/${t.id}.json`) to `/api/map/resources/${region}/${t.id}`.
   - Parse `{ xz }` from the response as today. Optionally read `total`/`sampled` to surface an honest "showing N of M" note in the finder/points UI.
   - Remove the now-unused `DATA_BASE` constant (creatures keep using `/map/enemies/...`).

### Downsampling (mega-resources)

- Default cap: **~5,000 points per region** (tunable).
- Method: **grid-bucketing** — divide the region's small-hex coordinate space into a grid sized so that roughly `CAP` occupied cells remain, keep one representative point per occupied cell. Preserves spatial distribution far better than uniform stride, and 581k individual dots are visually unreadable anyway.
- `total` = true count returned by the game; `sampled` = `true` when downsampling occurred. No silent truncation.

### Caching & minimal-impact guarantee

- `unstable_cache` (revalidate 900 s) + CDN `s-maxage` means the live game is queried **at most once per (region, resource) per 15 minutes**, independent of visitor count.
- On-demand only ever queries **what users actually view**, versus the abandoned plan's blind 403 MB pull every 6 hours.
- A mega-resource cache-miss still pulls its full set (~50 MB) from the game once per window (no source-side cap is possible); the 15-minute TTL bounds this to a trickle.

### Error handling

- WS connection failure or timeout: the route returns a 5xx and the result is **not cached**, so a transient game blip is retried on the next request rather than caching emptiness. (`unstable_cache` only caches successful returns; the helper throws on failure.)
- Genuinely empty result (resource not present in that region): `{ xz: [], total: 0, sampled: false }`, cached normally.
- Client behavior is unchanged: a non-OK response yields no points for that key (consistent with today's 404 handling).

### New environment

- Web server runtime needs `SPACETIME_URI` and `SPACETIME_TOKEN` (server-only, **never** `NEXT_PUBLIC`) in Netlify env. Read-only dev token, kept server-side — consistent with existing secret-handling rules. The per-region module name is derived as `bitcraft-live-${region}`.

## Testing (TDD)

- **Grid-bucket downsampler** (pure fn): returns `<= CAP` points; preserves spatial spread (occupied-cell coverage); sets `sampled` correctly; passes through unchanged when already under cap.
- **`xz` packing** (pure fn): rows → flat `[x,z,...]` small-hex array; correct length and ordering.
- **Route handler** with a **mocked** query fn: param validation (good/bad region + id); downsample integration; error path does not cache; empty result shape.
- **No live-game calls in CI** — the spike already validated the live path, and hammering the game in tests would violate the minimal-impact requirement. The query helper is structured so the route can inject a mock.

## Out of scope (deliberately)

- Creature dots, road overlays, and detail-page embedded maps — unaffected; keep their current static sources.
- Keeping `spawnCounts` fresh — already DB-backed and near-static (counts of spawn locations barely move); a separate concern, not part of this work.
- Removing the now-dead worker `positions` stage, the local 403 MB `apps/web/public/map-data` repo, and the empty `marts9182/bitcraftcompanion-map-data` GitHub repo — harmless; cleanup deferred.

## Future options (not now)

- Tiered TTLs (longer for the few mega-resources).
- Client-side viewport filtering (browser already holds the region's points).
- A density/heatmap rendering for abundant resources instead of capped dots.
- Pre-warming the cache for popular resources from the existing worker.
