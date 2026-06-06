# Phase 4 — Interactive Map (v1, core) — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming → spec). Next: implementation plan.
**Phase:** 4 (third sub-project). Builds on the live-ingestion foundation proven by the
leaderboards work.

## 1. Summary

An interactive world map at **`/map`** showing BitCraft's regions, claims, and empire
territory, rendered with **Leaflet (`CRS.Simple`)** over a base terrain image extracted
from the game install. Map data refreshes on the same auto-discovering worker snapshot as
the leaderboards, so it stays current as the world grows (the game has already added 4
regions; the design adapts to new regions automatically).

This follows the proven community approach (the open-source, BSD-2-licensed
**bitcraftmap.com** uses Leaflet + `CRS.Simple` + a base image + GeoJSON layers), fed by
**our own ingested data** rather than a third-party API — consistent with the project's
"same as the others, but better, on our own data + SEO" thesis.

### Research basis (2026-06-06)
- **bitjita** has no map. **bccodex / bitcraftcodex** use a PixiJS+Lit hex web component
  (resources + live players). **bitcraftmap** (open source, BSD-2,
  `github.com/bitcraftmap/bitcraftmap`) uses **Leaflet + `CRS.Simple`**, a base `map.png`
  rendered from game files, and **"Small Hex" coordinates 0–23040 that are exactly the
  `location X / location Z` from the database** — i.e. no coordinate transform is needed
  for marker/polygon layers. We adopt this approach.

## 2. Scope

**In (v1 — core map):**
- `/map` route: Leaflet `CRS.Simple` client map + SSR shell for SEO.
- Base terrain image extracted from the local game install, aligned to 0–23040 bounds.
- Three layers, each toggleable:
  1. **Claims** — searchable markers with popups (`claim_local_state`).
  2. **Region grid + names** — rectangles + labels (`world_region_state` /
     `world_region_name_state`).
  3. **Empire territory** — chunks colored by controlling empire (`empire_chunk_state`).
- Map data ingested by the existing worker snapshot (auto-discovering regions), so it
  stays current; world bounds + region grid derived live from `world_region_state`.
- A **visual review checkpoint**: once v1 renders with real data, show the running map to
  the owner before finalizing.

**Out (deferred to their own cycles):**
- **v2 — Resources:** `resource_state` (no coordinates) joined to `location_state` (the
  large all-entity position table) — the "where to gather" layer.
- **v3 — Live players:** `mobile_entity_state` (moving entities) — near-real-time refresh
  + a privacy decision on showing individual live positions.
- Waypoint sharing / GeoJSON import, pathfinding, market-on-map, watchtower analytics
  (bitcraftmap "wild ideas") — future.

**Non-goals:**
- No public API. No PixiJS/custom WebGL renderer (Leaflet suffices for v1).
- No redistribution of third-party game-art map images — we extract our own (see §4).

## 3. Tech & integration

- **`react-leaflet`** + **`leaflet`** + **`leaflet-search`** (or equivalent) in `apps/web`.
- The map is a **client island** (`"use client"`, loaded via `next/dynamic` with
  `ssr: false`, since Leaflet needs `window`).
- The `/map` page server-component renders an SEO shell (title, description, JSON-LD, and a
  crawlable text summary: region names + claim count) and mounts the client map.
- **`CRS.Simple`** with bounds `[[0,0],[23040,23040]]`; the base image is an `ImageOverlay`
  (or a simple tile layer) across those bounds. A **canvas renderer** (`L.canvas()`) is
  used for the territory layer so ~38k cells stay performant.

## 4. Coordinates & base image

- **No coordinate transform for data:** game `x, z` (0–23040) are used directly as Leaflet
  `CRS.Simple` `[lat=z, lng=x]` (or the bitcraftmap convention; pinned in the plan after a
  one-time alignment check against a known claim).
- **Base terrain image** is extracted from the local BitCraft install with a UnityPy script
  (mirroring `scripts/extract-game-icons.py`), written to `apps/web/public/map/world.webp`
  (or sliced tiles if the single image is too large), aligned to the 0–23040 bounds.
- **World bounds + region grid are dynamic:** read from `world_region_state` each ingest
  (`region_min_chunk_x/z`, `region_width/height_chunks`, `region_count*`). New regions
  appear in the grid/data automatically; only the base **image** needs a re-extraction on a
  region-adding patch (documented script; data layers stay live in between).

## 5. Data ingestion (extends the worker)

The worker snapshot gains these tables (mostly global/replicated; pulled once or per the
module that serves them), into new Postgres tables:
- `claim_local_state` → `map_claims` (entityId, region, x, z, name, numTiles, treasury,
  supplies, …) — note: `claim_local_state.location` is a `Sum`; decode the `{x,z,dimension}`
  payload. Claim names come from `claim_state` (join by entityId).
- `empire_chunk_state` → `map_chunks` (chunkIndex, empireEntityId, watchtowerEntityId).
- `world_region_state` → `map_regions` (id, minChunkX, minChunkZ, widthChunks,
  heightChunks, regionIndex, regionCount, regionCountSqrt).
- `world_region_name_state` → region display names (merge into `map_regions` or a names
  table).

Refreshed on the same cadence as the leaderboard snapshot, auto-discovering regions.

## 6. Layers (v1)

- **Claims** (`map_claims` → markers): clustered/canvas markers at `(x,z)`, searchable by
  name, popups show owner/tiles/treasury and link to the empire detail page. Independent of
  the chunk decode — ships first.
- **Region grid + names** (`map_regions`): each region's chunk bounds converted to x,z
  rectangles + a name label. Cheap; orients the viewer; adapts to new regions.
- **Empire territory** (`map_chunks` → colored cells): each owned chunk rendered as a cell
  colored by its empire, canvas-rendered. Hover → empire name; click → empire detail.
  **Depends on the chunk-index decode (§8 spike).**

A layer-toggle control turns each layer on/off; default shows base image + regions +
claims, territory optional.

## 7. Data flow & rendering

- A server route/loader emits a **compact per-layer payload** from Postgres (claims as
  point list; regions as rect list; territory as a packed `[chunkIndex, empireColorIndex]`
  array + an empire color/legend map) — NOT verbose GeoJSON for the 38k chunks, to keep the
  payload small.
- The client map builds Leaflet layers from the payload. Territory cells are drawn on a
  shared canvas renderer. Empire→color is a stable hashed palette with a legend.
- The page uses ISR (`revalidate` ~ snapshot cadence) so the served data tracks the latest
  snapshot.

## 8. The chunk-index decode (primary spike)

`empire_chunk_state.chunk_index` (U64) must become an `(x,z)` cell rectangle. Approach:
1. `location_state` carries **both** `chunk_index` and `x,z` for entities — sample it to
   reverse-engineer the `chunk_index → (chunk_x, chunk_z)` packing and the chunk size in
   x,z units.
2. Cross-check against `world_region_state` per-region `region_min_chunk_x/z` + chunk
   dimensions (each region is a block of chunks at a known chunk origin).
3. Encode the resolved transform as a **pure, unit-tested function**
   `chunkIndexToBounds(chunkIndex, regions) → {x0,z0,x1,z1}`.

**Risk + fallback:** BitCraft is hex-based ("small hex" coordinates), so chunk geometry may
not be a clean square grid. If the exact decode proves intractable within the build's
timebox, **ship claims + region grid (which don't need it) and fast-follow the territory
layer** — the territory layer is independent and additive.

## 9. Testing

**Pure unit tests:**
- `chunkIndexToBounds` (decode → cell bounds; against sampled `location_state` truth pairs).
- Region chunk-bounds → x,z rectangle conversion.
- The per-layer payload builders (claims/regions/territory → client payload shape).
- The `claim_local_state.location` Sum decoder (extract x,z,dimension).

**Map component + ingestion:** verified by a live snapshot run + a **visual review with the
owner** (explicit checkpoint) — the map is inherently visual; screenshots/the running dev
server are the acceptance test, consistent with the repo's no-DB-unit-test convention.

## 10. Files (anticipated)

- `scripts/extract-game-map.py` — UnityPy base-image extraction (mirrors the icon script).
- `packages/shared/src/db/schema.ts` — `map_claims`, `map_chunks`, `map_regions` tables.
- `packages/shared/src/ingest/map-world.ts` (+ test) — pure mappers + the location Sum
  decoder + `chunkIndexToBounds`.
- `apps/worker/src/leaderboard-snapshot.ts` (or a sibling) — pull the map tables.
- `apps/web/lib/queries/map.ts` — server loaders emitting the per-layer payloads.
- `apps/web/app/map/page.tsx` — SSR shell + dynamic client map.
- `apps/web/components/map/*` — `WorldMap` (client island), layer controls, claim search.
- Wiring: nav link, sitemap, llms.txt; `apps/web/public/map/world.webp` (extracted asset).

## 11. Open unknowns (resolve during implementation)

- **Chunk-index geometry** (§8) — the main one; sampled `location_state` resolves it.
- **Base-image asset location** in the game install (which Unity bundle / texture is the
  world map) and its coordinate alignment to 0–23040 — a small extraction spike.
- **Which module serves `empire_chunk_state` / `world_region_state`** (global vs region)
  and total `map_chunks` volume — confirm during the first snapshot.
- **x/z vs lat/lng orientation** in `CRS.Simple` (and whether z increases up or down) —
  pin with a one-time alignment check against a known claim location.
