# Settlements (design)

**Date:** 2026-06-06
**Status:** Design / approved by user — **PAUSED before writing-plans** (restore point for next session)
**Context:** A late Phase 4 addition, requested after the four original pillars shipped (crafting calculator, leaderboards + empires/players, interactive map, market & economy). A new top-level **Settlements** section with its own header link, surfacing all the settlement-level information we can get — with an emphasis on the **supply economy** ("that is where supplies come in").

> A settlement = a player **claim** (the entity that holds supplies, treasury, tiles, members, buildings).

---

## 1. Confirmed decisions (clarifying gate)

- ✅ **Data depth:** settlement *economy + members*. NO per-building inventory (full `building_state` is a very large volume and is deferred).
- ✅ **History:** track supplies/treasury over time **from day one** (cheap, like the market price-history). Irreplaceable if not captured now.
- ✅ **Which claims:** **player settlements only** — filter via the existing `classifyClaim` (drop "landmark"/ruin claims).
- ✅ **Default browse sort:** **largest by tiles** (supplies/treasury/maintenance/members are sortable columns alongside).
- ✅ **Build approach: A** — dedicated `settlements` + `settlement_supply_history` tables (vs. extending `claims`, vs. minimal surface-only). Reuses the proven market pipeline; isolates the feature; minor field overlap with the map's `mapClaims` is left deliberately un-refactored.

## 2. Scope

### In scope (v1)
- Ingest the settlement economy by joining already-fetched per-region tables: `claim_state` (name/owner), `claim_local_state` (supplies economy, tiles, treasury), `empire_settlement_state` (empire link, storehouse flag, member donations), and `claim_member_state` (member count + roster).
- `/settlements` browse list (player settlements only) and `/settlements/[id]` detail.
- Per-settlement supplies/treasury **history** time series, accumulated from launch.
- Cheap cross-links: player detail's claim list → settlement; map settlement popups → settlement.
- Header nav entry.

### Out of scope (v1) — deferred
- Per-building inventory / building catalog per settlement (full `building_state` ingest).
- Claim tech / per-tile data.
- "Days of supplies remaining" derived metric (maintenance period/unit unconfirmed — show raw supplies + maintenance + the trend chart instead; do not fabricate a countdown).
- Empire detail listing its settlements (possible future cross-link).

---

## 3. Data model (Drizzle — `packages/shared/src/db/schema.ts`)

Two new tables. The member roster **reuses the existing `claimMembers`** table (no new members table). Big-int-safe ids are strings.

### 3.1 `settlements` — one row per player settlement (region-scoped, clean-rebuild per snapshot)
| column | type | notes |
|---|---|---|
| `entityId` | text PK | claim entity id |
| `region` | text notNull | scopes the clean rebuild |
| `name` | text notNull | |
| `ownerPlayerEntityId` | text | → players |
| `empireEntityId` | text | → empires (from `empire_settlement_state`) |
| `x`, `z`, `dimension` | integer | decoded via `decodeLocationSum` |
| `numTiles` | integer | |
| `numTileNeighbors` | integer | |
| `supplies` | bigint(number) | current supplies |
| `suppliesPurchaseThreshold` | bigint(number) | auto-buy threshold |
| `suppliesPurchasePrice` | bigint(number) | auto-buy price |
| `buildingMaintenance` | real | maintenance drain (likely fractional) |
| `treasury` | bigint(number) | Hex Coins |
| `xpSinceMinting` | bigint(number) | `xp_gained_since_last_coin_minting` |
| `canHouseStorehouse` | boolean | `can_house_empire_storehouse` |
| `membersDonations` | bigint(number) | `members_donations` |
| `memberCount` | integer | denormalized from `claim_member_state` |
| `updatedAt` | timestamp | |

Indexes: `(region)`, `(numTiles)`, `(supplies)`, `(treasury)`, `(name)`, `(ownerPlayerEntityId)`, `(empireEntityId)`.
*(Exact numeric types for the economy fields are confirmed against a live snapshot during implementation, as was done for the market columns. Settlements that have `claim_state` but no `claim_local_state` are still included, with null/0 economy.)*

### 3.2 `settlement_supply_history` — append-only trend series
Composite PK `(settlementEntityId, snapshotAt)`. Columns: `settlementEntityId` · `snapshotAt` timestamp · `supplies` bigint · `treasury` bigint · `buildingMaintenance` real · `numTiles` integer. Index `(settlementEntityId, snapshotAt)`. ~10k rows/snapshot; **stamped with SQL `now()`** (NOT a bound JS Date — that crashed the market snapshot). Prune/downsample noted as future.

### 3.3 Member roster
Reuse `claimMembers` (`claimEntityId`, `playerEntityId`, `region`, `claimName`, `coOwner`, `officer`, `build`, `inventory`). Detail page queries it by claim id; `memberCount` is denormalized into `settlements`.

---

## 4. Ingest (`apps/worker/src/leaderboard-snapshot.ts` + shared mapper)

**No new source queries** — `claim_state`, `claim_local_state`, `claim_member_state`, and `empire_settlement_state` are already in `REGION_QUERIES`.

### 4.1 Pure mapper — `packages/shared/src/ingest/map-settlements.ts` (+ test)
`mapSettlements(claimStateRows, claimLocalRows, settlementStateRows, memberRows, region) → SettlementRow[]`:
- Build lookups: `localByClaim` (entity_id → economy), `settlementByClaim` (claim_entity_id → { empireEntityId, canHouseStorehouse, membersDonations }), `memberCountByClaim` (claim_entity_id → count).
- For each `claim_state` row: **skip unless `classifyClaim(name)` is a settlement**. Else assemble a `SettlementRow` joining economy + empire link + member count; decode location via `decodeLocationSum`.
- Big-int-safe ids; reuse `toInt`/`bool` helpers. Tests: settlement-vs-landmark filtering, economy join, empire link, member count, location decode, missing-local fallback.

### 4.2 Region-loop write (inside the existing per-region transaction)
Clean rebuild: `DELETE settlements WHERE region = $region` then chunked upsert (same pattern as market/empires).

### 4.3 Post-loop history append (after the region loop)
`INSERT INTO settlement_supply_history (settlement_entity_id, snapshot_at, supplies, treasury, building_maintenance, num_tiles) SELECT entity_id, now(), supplies, treasury, building_maintenance, num_tiles FROM settlements ON CONFLICT DO NOTHING`. Sits beside the existing reserve-capsules / map / market post-loop passes.

---

## 5. Web (`apps/web`)

### 5.1 Queries — `apps/web/lib/queries/settlements.ts` + params `apps/web/lib/settlements/params.ts`
- `getSettlementsList({ q, region, sort, page })` — scans `settlements`; default sort `numTiles` desc; sorts: tiles, supplies, treasury, maintenance, members, name; `q` ilike on name; region filter. Owner/empire names resolved by join to `players`/`empires` at query time (page-sized).
- `getSettlement(id)` — settlement row + owner username + empire name.
- `getSettlementMembers(id)` — from `claimMembers` (with permissions), → player links.
- `getSettlementHistory(id)` — `settlement_supply_history` ordered by `snapshotAt`.
- `listSettlementIds(limit)` — top settlements by tiles for `generateStaticParams`.

### 5.2 Pages
- **`/settlements/page.tsx`** — list: Name → detail, Region, Owner → player, Empire → empire, Tiles, Supplies, Treasury, Maintenance, Members. Default sort tiles desc; name search; region filter; sortable headers; Pager; `revalidate = 60`. Reuses the empires/market list idiom.
- **`/settlements/[id]/page.tsx`** — detail (modeled on empires/market detail): header (name, region, owner/empire links); stat grid (tiles, neighbors, supplies, supplies threshold, purchase price, maintenance, treasury, XP-since-minting, members, can-house-storehouse, member donations); **two trend charts** (Supplies, Treasury) from history; members table (permission badges → player links); location coords + a "view on map" link. `generateStaticParams` (top settlements), `generateMetadata`, `revalidate = 300`, `dynamicParams = true`.

### 5.3 Trend chart — `apps/web/components/settlements/SettlementTrendChart.tsx`
A small reusable single-series SVG line chart (one component, rendered twice for supplies and treasury). `<2` points → "history accrues from launch forward" note. (Two series have very different magnitudes, so render two separate single-series charts rather than overlaying.)

### 5.4 Cross-links & nav
- **Player detail** (`apps/web/app/players/[id]/page.tsx`): in the existing claims list, link claims whose name is a `classifyClaim` settlement to `/settlements/[claimId]` (non-settlement claims stay plain text — avoids dead links).
- **Map popup**: settlement markers get a "Details →" link to `/settlements/[id]` (marker id is the claim entityId).
- **Nav** (`apps/web/components/SiteHeader.tsx`): add `["/settlements", "Settlements"]` after Empires.

---

## 6. Testing & verification
- **Unit (Vitest):** `mapSettlements` — landmark filtering, economy/empire/member-count join, location decode, missing-`claim_local_state` fallback, big-int ids.
- **Live verify (next session, after a snapshot):** settlement count and names look sane; supplies/treasury/tiles/maintenance populated; confirm the economy numeric types/units against real rows (esp. `building_maintenance`, `members_donations`); confirm history appends a slice per run (slices ≥ 2 after two snapshots).
- Keep `main` green: `pnpm typecheck` + `pnpm test` per commit; `pnpm --filter @bcc/web build` at the end.

## 7. Build/rollout order (for the plan)
shared mapper + tests → schema + migration (apply via `apply-sql.mjs`) → worker ingest + post-loop history → web queries/params → list page → trend chart → detail page → cross-links (player detail, map) → nav → live snapshot verify → build. Commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 8. Lessons carried from the market build (apply directly)
- Stamp history with SQL `now()`, never a bound JS `Date` (postgres-js `ERR_INVALID_ARG_TYPE`).
- SpacetimeDB `Timestamp` fields serialize as `{__timestamp_micros_since_unix_epoch__}` and some enum fields as tagged `[tag,{}]` — settlements use no raw timestamps, but watch any enum/typed columns; confirm field encodings against live data before trusting them.
- Confirm source column orders / numeric types against a live snapshot (Task-6-style spot check) — the one assumption that needs real data.
