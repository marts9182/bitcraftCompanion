# Empires + Players sections & site header — design (2026-06-06)

Owner stepped away and delegated "make all good coding decisions." This documents the
autonomous decisions for three asks: (1) a dedicated, searchable, data-rich **Empires**
section; (2) a dedicated, data-rich **Players** section; (3) a high-quality **header with a logo**.

## Data availability (probed live against EA2, bitcraft-live-14)

**Empires** — directly available, will ingest:
- `empire_state`: `empire_currency_treasury` (**hexcoin** balance), `shard_treasury` (treasury, already), `num_claims`, `nobility_threshold`, `owner_type`, `capital_building_entity_id`.
- `empire_node_state` (**towers/watchtowers**): per node `energy`, `upkeep`, `active`, `chunk_index` → list + aggregates per empire.
- `empire_player_data_state` (members): `donated_shards`, `donated_empire_currency`, `noble`, `rank`.

**Deferred (documented, not shipped now)** — uncertain/heavy plumbing:
- Physical storehouse goods (**hexite dust/shard, hexite capsule** quantities): live in `inventory_state.pockets`, owned by a storehouse building. The empire→storehouse link is unverified (0 of 517 region-14 settlements had `can_house_empire_storehouse`), and a region-wide inventory pull is heavy. Item ids found for later: Hexite Capsule cargo `2000000`, Hex Coin item `1`, Hexite Shard item `2143560479`, Hexite Dust item `1128755342`. A targeted `SELECT * FROM inventory_state WHERE owner_entity_id IN (…)` subscribe is the intended approach once the storehouse-owner link is confirmed.
- Empire-wide **supplies**: claims carry `supplies` but link to empires only via chunk ownership (claim location → chunk → `empire_chunk_state`); deferred with hexite. Tower `energy` is shipped as the concrete "energy in towers" the owner asked about.

**Players** — directly available, will ingest:
- `player_state`: `time_played` (have), `signed_in` (have), `sign_in_timestamp` (last-seen), `time_signed_in`.
- `experience_state` → skills + level + XP (have); derived total level / total XP.
- `empire_player_data_state` → the player's empire + rank (join).
- `claim_member_state`: the player's **claim memberships** + permissions (co-owner/officer/build/inventory).
- Absent in EA2: `player_shard_state`, `user_creation_timestamp_state` → no shards / account-age.

## Schema changes (Drizzle migration 0005)

- `empires` add: `currency_treasury bigint`, `nobility_threshold bigint`, `owner_type integer`, `tower_count integer`, `tower_energy bigint`, `tower_upkeep bigint`. (Keep existing `treasury`=shard treasury, `num_claims`, `member_count`, `color`, `leader_player_entity_id`.)
- `empire_members` add: `donated_shards bigint`, `donated_currency bigint`, `noble boolean`.
- New `empire_towers` (entity_id PK, empire_entity_id, region, chunk_index text, energy bigint, upkeep bigint, active boolean) — per-tower list, indexed by empire.
- `players` add: `sign_in_timestamp bigint` (last sign-in), `time_signed_in integer`.
- New `claim_members` (player_entity_id, claim_entity_id, region, claim_name, co_owner boolean, officer boolean, build boolean, inventory boolean; PK [claim_entity_id, player_entity_id]) — indexed by player.

## Worker ingestion (leaderboard-snapshot.ts)

- Extend `REGION_QUERIES` with `empire_node_state`, `claim_member_state` (empire_player_data_state already pulled).
- New shared mappers (pure, tested): `mapEmpireNodes(rows, region)` → tower rows + per-empire aggregates; extend `mapEmpireData` to read `empire_currency_treasury`/`nobility_threshold`/`owner_type` and member `donated_*`/`noble`; `mapClaimMembers(rows, region)` → claim_members rows.
- Per region: upsert empire_towers (clear-by-region first), claim_members (clear-by-region first); attach tower aggregates + currency/nobility/owner to empire rows; attach donations/noble to member rows.

## Web — Empires (top-level `/empires`)

- **`/empires`** — searchable, sortable list. Server reads `?q=` (name search, ilike), `?sort=` (claims|treasury|hexcoin|members|towers), `?region=`, `?page=`. Table columns: rank, name (color swatch), region, members, claims, hexcoin, shard treasury, towers. Clickable sortable headers (links that set `?sort=`), a search `<form method=GET>` box (no client JS needed), region switcher, pager. Reuse `Pager`, `RegionSwitcher`.
- **`/empires/[id]`** — enriched detail: header with name + color; stat grid (hexcoin, shard treasury, claims, members, nobility threshold, owner type, tower count, total tower energy, total upkeep); **Towers** section (list: location chunk, energy, upkeep, active); **Members** section (rank, username link, donated shards, donated hexcoin, noble badge). Keep ISR.
- Redirect `/leaderboards/empires` → `/empires` (Next `redirect()`), drop the empires card from the leaderboards hub but keep skills/activity there.

## Web — Players (top-level `/players`)

- **`/players`** — searchable, sortable list (new). `?q=` username search, `?sort=` (level|playtime|name), `?region=`, `?page=`. Columns: rank, username, region, total level, hours played, online dot. Search form + region switcher + pager. (Reuses the same list scaffolding as empires.)
- **`/players/[id]`** — enrich the existing detail: add the player's **empire** (name link + rank) and **claims** (claim name + role badges) above the existing skills table; add last-seen (sign_in_timestamp) + total signed-in time to the activity line. Keep skills table.
- Nav + sitemap + llms.txt updated for `/empires` and `/players`.

## Web — Header + logo

- New `components/SiteHeader.tsx`: a sticky **dark masthead** (`#1D1B22` bg, cream `#E9DFC4` text, gold `#D5BB72` accent) sitting above the light body — premium without doing the deferred full-site dark redesign. Logo mark (inline SVG, hexagon "BitCraft" motif in gold) + "BitCraft Companion" wordmark (Josefin Sans via `next/font/google`), nav links with active-state highlight (gold underline) using `usePathname`. Responsive (wrap/scroll on mobile). Nav order: Compendium hub items, Map, Empires, Players, Leaderboards, Blog. Add `next/font` (Josefin Sans for the wordmark only — body stays as-is).
- Logo asset: an inline SVG component `components/Logo.tsx` (no external file needed); also export a `/icon.svg` favicon.

## Quality / testing
- Pure mappers unit-tested (vitest) in `packages/shared`. `pnpm -r typecheck` + `pnpm vitest run` green before each commit. Migration generated + applied to Neon. Re-run `leaderboard-snapshot` to populate, then verify pages render real data.

## Out of scope (this batch)
Storehouse physical goods (hexite/capsules) + empire-wide supplies aggregate (documented above); full dark-theme site redesign (separate deferred phase).
