# Phase 4 — Leaderboards + Dynamic-Data Foundation — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming → spec). Next: implementation plan.
**Phase:** 4 (second sub-project; first of the three "live data" features). Establishes the
**dynamic-data ingestion foundation** that the later map and market sub-projects reuse.

## 1. Summary

Region-scoped **leaderboards** for BitCraft, built on a new **dynamic-data ingestion
foundation** that refreshes player/empire/claim state from every live region on a short
schedule. Four leaderboard categories ship in v1:

1. **Per-skill player rankings** — top players in each skill by XP/level.
2. **Total player ranking** — players by total XP / total level across all skills.
3. **Empire leaderboards** — empires by claims, treasury, member count.
4. **Activity extras** — time-played ranking and a "players online now" count.

Plus lightweight **player** and **empire** detail pages that cross-link into the existing
compendium. Everything is region-filterable via a region switcher.

### Benchmark: bitjita.com (what we match and beat)

The project goal is to be 10× better than bitjita.com. Their leaderboards (researched
2026-06-06):

- **Skills leaderboard:** ranks by Total XP; a grid with all **18 skills** as level
  columns plus highest skill, total level, total XP; filters for region, skill, and time
  period ("last 30 days" active); a level↔XP toggle; 100/page (≈36,509 players).
- **Empires:** Name, Leader, Members, Claims, Territory (tiles), Hexite Energy (treasury),
  Location; ≈203 empires.
- Also an exploration leaderboard (region discovery), player profiles, and a public API.
- They expose `/static/experience/levels.json` — an XP→level threshold table (a BitCraft
  game constant), confirming **levels are computable**, not just raw XP.

**Our edge:**
- **SEO/AEO** — bitjita is a client-rendered SPA; every leaderboard, player, and empire
  page of ours is SSG/ISR + JSON-LD + sitemap, so we win search/answer engines.
- **Speed** — edge-cached static pages vs their live API.
- **Integration** — player skill rows and empire/claim data cross-link into our compendium
  and crafting calculator, which a standalone leaderboard site cannot do.

## 2. Scope

**In (v1):**
- Dynamic-ingestion foundation: scheduled multi-region snapshot of the dynamic tables.
- The four leaderboard categories above, each region-filterable.
- A region switcher (`?region=` query param; "all" aggregates).
- XP→level computation via a tested threshold constant.
- Lightweight `/players/[id]` and `/empires/[id]` detail pages (on-demand ISR).
- SSG/ISR + metadata + JSON-LD + sitemap for the leaderboard/empire pages.

**Out (deferred):**
- **"Last 30 days" XP-gained / trends** — requires retaining snapshot *history* (a
  time-series feature); v1 shows current standings only.
- **Exploration leaderboard** (region discovery) — future category.
- **Rich player profiles** (inventories, market orders) — overlaps the market sub-project.
- **Empire "territory tiles" count** — needs joining `claim_tile_state` (large); v1 empire
  ranking uses the direct `num_claims` + member count + treasury.
- **Continuous streaming ingestion** — v1 uses frequent snapshots (see §5). Streaming is a
  foundation upgrade for the later market sub-project; leaderboards inherit it then.

**Non-goals:**
- **No public API.** We consume the live data and render our own pages; we do not expose
  an API for third parties.
- No reducer calls ever (read-only subscribe only — calling reducers risks a ban).

## 3. Data sources (live SpacetimeDB tables)

From the EA2 `bitcraft-live-N` region modules (connection is already solved; see
[[spacetimedb-ws-protocol]]). Column shapes confirmed from the schema snapshot
(`docs/reference/bitcraft-schema.json`):

- `player_username_state` — `entity_id:U64, username:String`
- `player_state` — `entity_id:U64, time_played:I32, signed_in:Bool, sign_in_timestamp,
  time_signed_in, …`
- `signed_in_player_state` — `entity_id:U64` (presence = currently online)
- `experience_state` — `entity_id:U64, experience_stacks: [{ skill_id:I32, quantity:I32 }]`
  (quantity = XP for that skill)
- `skill_desc` — `id:I32, name:String, skill_category, max_level:I32` (the 18 skills)
- `empire_state` — `entity_id:U64, name:String, num_claims:I32, shard_treasury:U32,
  capital_building_entity_id, nobility_threshold, location`
- `empire_player_data_state` — `entity_id, empire_entity_id:U64, rank:U8, donated_shards`
- `empire_rank_state` — `entity_id, empire_entity_id:U64, rank:U8, title:String`
- `claim_state` — `entity_id:U64, owner_player_entity_id:U64, name:String, neutral:Bool`

## 4. Data model (new Drizzle/Postgres tables in `packages/shared`)

Every player/empire/claim row carries a `region` discriminator so leaderboards filter by
region and "all" aggregates.

- **`regions`** — `id` (module suffix / region key, e.g. `"1"`, `"14"`), `module`
  (`"bitcraft-live-14"`), `name` (display), `updatedAt`.
- **`players`** — `entityId` (PK, bigint as text/numeric), `region`, `username`,
  `timePlayed` (int seconds), `signedIn` (bool), `updatedAt`. Indexed on `(region)`,
  `(username)`.
- **`skills`** — `id` (int PK), `name`, `category`, `maxLevel`. (From `skill_desc`.)
- **`playerSkills`** — `playerEntityId`, `skillId`, `region`, `xp` (int), `level` (int,
  computed at ingest). Composite index `(region, skillId, xp desc)` for per-skill ranking;
  index `(playerEntityId)`.
- **`empires`** — `entityId` (PK), `region`, `name`, `numClaims` (int), `treasury` (int),
  `leaderPlayerEntityId` (nullable), `memberCount` (int, computed), `updatedAt`.
- **`empireMembers`** — `empireEntityId`, `playerEntityId`, `region`, `rank` (int). Index
  `(empireEntityId)`, `(playerEntityId)`.
- **`claims`** — `entityId` (PK), `region`, `name`, `ownerPlayerEntityId` (nullable).

Notes:
- BitCraft entity ids are `U64` — store as Postgres `bigint` (Drizzle `bigint` mode
  `"number"` is unsafe above 2^53; use `numeric`/`text` for ids and parse carefully). The
  plan pins the exact column type.
- `players.username` comes from `player_username_state`; a player with XP but no username
  row falls back to a placeholder. `memberCount`/`leaderPlayerEntityId` are derived during
  ingest from `empire_member`/`empire_rank` data, not stored raw.

## 5. Ingestion foundation — frequent multi-region snapshots

A new worker entrypoint (`apps/worker/src/leaderboard-snapshot.ts`, runnable via a
`pnpm --filter @bcc/worker leaderboard-snapshot` script) that:

1. Reads the configured list of live region modules (env/config — see Open Unknowns).
2. For **each region sequentially**: connect → `SubscribeMulti` to the dynamic tables →
   collect the initial snapshot → close. (Sequential, not parallel, to avoid holding many
   live sessions open at once.)
3. Maps rows via pure mappers (e.g. unnest `experience_stacks` into `playerSkills` rows;
   compute `level` from XP; derive empire `memberCount`/`leaderPlayerEntityId`).
4. Bulk-upserts into Postgres tagged with the region (idempotent — same as the compendium
   ingest pattern), then optionally POSTs `/api/revalidate` to refresh ISR.

Reuses the existing `ws-snapshot.ts` transport, `normalizeRow`/`COLUMN_ORDERS` handling,
and the upsert orchestration. **Freshness:** designed to be run on a ~5–10 minute cron;
the scheduler itself is a deploy concern (in dev, run manually or via a `setInterval` loop
in the worker's long-running `main.ts` mode). Leaderboard pages use short-interval ISR
(`revalidate ≈ 60s`) so they reflect the latest snapshot. This satisfies "updated as
players play" without taming an XP event firehose.

## 6. Level computation

The BitCraft XP→level curve is a game constant. We add it as a tested module
(`packages/shared/src/leaderboards/levels.ts`) — an ascending array of cumulative XP
thresholds — and compute `level = count of thresholds ≤ xp` (capped at the skill's
`maxLevel`). Pure and unit-tested. Source the threshold values from the BitCraft GameData
dump or the known community curve (pinned in the plan). If the exact curve cannot be
confirmed, v1 still ranks correctly by raw XP and displays level as a best-effort derived
value.

## 7. Pages & UI (`apps/web`)

- **`/leaderboards`** — hub: cards/links to each category + a region switcher.
- **`/leaderboards/skills`** — all-skills grid (bitjita parity): rank rows by total XP
  (default), total level, or highest level; a column per skill showing level (or XP via a
  toggle); paginated 100/page; region filter. Player names link to `/players/[id]`.
- **`/leaderboards/skills/[skill]`** — single-skill ranking (rank, player, level, XP),
  region filter, paginated. One page per skill (≈18) — SSG/ISR.
- **`/leaderboards/empires`** — empires ranked by claims / treasury / members; columns
  Name, Leader, Members, Claims, Treasury, (Location); region filter; links to
  `/empires/[id]`.
- **`/leaderboards/activity`** — time-played ranking + a "players online now" count (and a
  short list); region filter.
- **`/players/[id]`** — username, region, a skills+levels grid, total level/XP, empire
  membership (link), claims, time played. **On-demand ISR** (`dynamicParams`,
  `generateStaticParams` returns a small top-N or none) — ~36k players make SSG-all
  infeasible. Cross-links into the compendium.
- **`/empires/[id]`** — name, leader, treasury, claim count, member list (links to
  players), claims list. On-demand ISR.

**Region switcher:** a client component that sets `?region=<key>` (default "all"). Server
components read it and scope queries. Sort/skill/page also live in query params (reuse the
existing `parseListParams` pattern).

**Reuse:** the existing `EntityTable`/`Pager`/`CompendiumFilters` components and the
`lib/queries/` pattern. New query builders live in `apps/web/lib/queries/leaderboards.ts`
(pure param/ranking helpers split from DB access, mirroring the craft-graph split).

### SEO
Leaderboard list pages and `/empires` get metadata + JSON-LD (empire as an `Organization`;
leaderboard pages as `ItemList`/`Dataset`-style structured data) + sitemap entries. Player
pages are crawlable via links from rankings (not all pre-rendered). `llms.txt` gains a
Leaderboards section.

## 8. Testing

**Pure unit tests:**
- Level computation (threshold lookup, cap at `maxLevel`, xp 0).
- `experience_stacks` unnesting (rows → per-skill records, with level).
- Empire derivation (member count, leader = lowest/zero rank).
- Ranking/aggregation builders (total XP, total level, highest level; per-skill ordering).
- Region + sort + page param parsing.

**DB / ingestion:** verified via the worker snapshot run against a region and a production
build (consistent with the repo's no-DB-unit-test convention).

## 9. Open unknowns (resolve during implementation)

- **Region module enumeration.** The exact set of live `bitcraft-live-N` modules is
  unknown. Resolve by probing the schema endpoint (200 vs 404) across a numeric range
  and/or reading a region table (`world_region_state` / `region_population_info`); keep a
  maintained config list. Start with the region(s) the dev token can reach.
- **XP→level threshold values.** Confirm the curve from the GameData dump or community
  source; pin the array in `levels.ts`.
- **Entity-id storage.** U64 ids exceed JS safe-integer range — pin `numeric`/`text`
  columns and parsing in the plan.
- **Snapshot volume per region.** `experience_state` + usernames for tens of thousands of
  players per region; confirm a single-region snapshot completes in a reasonable time and
  payload before enabling all regions.

## 10. Files (anticipated)

- `packages/shared/src/db/schema.ts` — new tables (regions, players, skills, playerSkills,
  empires, empireMembers, claims).
- `packages/shared/src/leaderboards/levels.ts` (+ test) — XP→level.
- `packages/shared/src/ingest/map-leaderboards.ts` (+ test) — pure row mappers.
- `apps/worker/src/leaderboard-snapshot.ts` — the multi-region snapshot job.
- `apps/web/lib/queries/leaderboards.ts` (+ pure-builder test) and a DB module.
- `apps/web/app/leaderboards/*` — hub, skills, skills/[skill], empires, activity.
- `apps/web/app/players/[id]/page.tsx`, `apps/web/app/empires/[id]/page.tsx`.
- `apps/web/components/leaderboards/*` — RegionSwitcher, SkillsGrid, etc.
- Wiring: nav link, sitemap, llms.txt.
