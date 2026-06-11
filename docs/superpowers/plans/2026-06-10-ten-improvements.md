# Ten Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One task per dispatch; two-stage review each.

**Goal:** Implement the 10 user-approved improvements from the Phase-A idea sweep (2026-06-10): market plain language, deals page, trade inference, command palette, depletion warnings, best-region callouts, recipes readable names, respawn-on-chips, freshness stamp, creature danger hints.

**Branch:** `feature/bitjita-parity` (LOCAL ONLY — no pushes). All established patterns from Phase A apply: list pages mirror siblings, `unstable_cache` 1800 on snapshot-cadence queries, humanized units, Vitest for pure logic, playwright (neighbor project `C:\Sandbox\project-seven`) for visual checks, root `pnpm test` (NEVER `--filter @bcc/web test` — silent no-op).

**Verified data facts (2026-06-10, do not re-derive):**
- `closed_listing_state` has NO price field (`entity_id, owner_entity_id, claim_entity_id, item_stack{item_id,quantity,item_type[tag,{}],durability}, timestamp`) — trade prices must be INFERRED by diffing order books between 30-min snapshots.
- `marketplace_state` = `{building_entity_id, claim_entity_id, coordinates(ref product — likely {x,z} small-hex)}` — deals distance is computable. Check what `mapMarketplaces` already ingests into the `marketplaces` table before adding columns.
- Recipes readable-names design is APPROVED at `docs/superpowers/specs/2026-06-09-recipes-names-tier-filter-design.md` (+ plan `2026-06-09-recipes-names-tier-filter.md`) — follow it; reconcile with Task-15 work (see Task B).
- Spec sections referenced: `docs/superpowers/specs/2026-06-10-bitjita-competitive-upgrade-design.md` B2/B3/B5, Phase C.

---

## Task A — Trade inference from order-book diffs (idea 3, TIME-SENSITIVE: history starts when this ships)

**Where:** `packages/shared/src/db/schema.ts`, the leaderboard worker (`apps/worker/src/leaderboard-snapshot.ts` + a new pure module `packages/shared/src/market/infer-trades.ts` with tests).
- New table `marketTrades`: id serial PK, itemId int, itemType text ("item"|"cargo"), region int, price bigint, quantity int, side text ("sell"|"buy" — which book the order was on), kind text ("partial"|"filled"), observedAt timestamptz default now. Indexes: (itemId, itemType, observedAt), (region, observedAt). Migration via db:generate (db:push crashes on a pre-existing PK bug — create the table via the generated SQL applied with a one-off script if needed).
- Pure function `inferTrades(prevOrders, nextOrders)` (TDD): match orders by their stable order entity id; qty DECREASE on same order → trade `{qty: prev-next, price, kind:"partial"}`; order PRESENT before and ABSENT now → trade for full remaining qty with `kind:"filled"` (ambiguous with cancellation — store anyway, flag via kind; UI can weight "partial" higher). Price rises/new orders → ignore.
- Worker integration: in the market section of the snapshot, BEFORE overwriting `marketOrders`, read the existing rows for that region, diff against incoming, insert inferred trades. Keep it cheap (both sides already in memory). Prune trades older than 90 days (same pattern as settlementSupplyHistory pruning — find and mirror it).
- Run the snapshot once locally to verify rows appear (or verify on the next scheduled run if local run is too heavy — the leaderboard snapshot is the 30-min job; running it locally once is established practice).
- NO UI this task (Tasks F/G consume it).

## Task B — Recipes readable names (idea 7)

Execute `docs/superpowers/specs/2026-06-09-recipes-names-tier-filter-design.md` §2-§5 (read it + its plan file first). Reconciliation with Task-15 state (already shipped): tier select + `recipeOutputTierSql` (MAX-based) + typeahead exist. The design supersedes: switch tier derivation to PRIMARY-output tier (highest qty, tiebreak lowest ref_id, DISTINCT ON), title = primary output name + verb badge (`recipeVerb` helper, TDD), makeable filter (`tier <> -1 AND name IS NOT NULL`), search matches OUTPUT name. ALSO update the recipes suggest catalog (`lib/queries/suggest.ts`) to serve resolved output names (+ verb in the label) so typeahead becomes genuinely useful — this was the user's stated motivation. Detail page title resolves the same way. Keep `recipeOutputTierSql` only if still referenced; otherwise remove.

## Task C — Small data-driven touches (ideas 6, 8, 10 — one task)

1. **Best region to farm** (`apps/web/app/resources/[slug]/page.tsx`): above SpawnRegionsList, when spawnCounts non-empty: "Densest in {RegionName} — {n} spawn points." (region name lookup already on the page).
2. **Respawn on map chips** (`apps/web/components/map/MapFinderPanel.tsx` + `getResourceMapCatalog`): add `respawnSeconds` to the catalog select; chip + search-row `title` tooltip gains "respawns {formatDuration}" for resources that have it (creatures untouched).
3. **Danger hint on creatures** (`apps/web/app/creatures/[slug]/page.tsx`): plain-language line under combat stats from attackLevel/defenseLevel/maxHealth — e.g. "Combat level {max(attackLevel, defenseLevel)} — bring gear around level {that} or higher." Pure helper + test if any logic beyond string assembly.

## Task D — Data freshness stamp (idea 9)

Site-wide footer (find the footer component) line: "Game data updated {relative} ago" from the latest `ingestionRuns` row with status "ok" (`finishedAt`). Query in `apps/web/lib/queries/` wrapped in `unstable_cache` with revalidate 300 (NOT 1800 — staleness display should lag less). Relative-time helper: check `formatDuration`/existing date utils first; dual title tooltip with absolute time (site convention from spec). Graceful when table empty ("—"). The footer is presumably a server component — verify; if client, fetch via a tiny server wrapper.

## Task E — Supplies depletion projection (idea 5)

`apps/web/lib/queries/settlements.ts` (read it + the detail page's existing trend-chart query): compute depletion ETA per settlement from `settlementSupplyHistory` — linear slope over the last 7 days of supplies; if slope < 0, ETA = now + supplies/|slope|. Surface:
- Detail page: "Supplies run out ~{date} ({in N days})" stat near the supplies trend chart; omit when slope >= 0 ("Supplies stable/rising").
- List page: a "Runs out" sortable-ish column or badge for settlements with ETA < 14 days ("{N}d" amber badge) — match the list's existing column idiom; don't add heavy per-row history queries — compute in ONE grouped SQL over history (last-7d two-point or regression per claim) joined to the list, or precompute in the query module with `unstable_cache` 1800.
- Pure slope/ETA helper in `packages/shared` or web lib with tests (TDD).

## Task F — Plain-language market sweep (idea 1; spec §B5)

Read the spec's B5 section + `apps/web/app/market/page.tsx` + `market/[key]/page.tsx` fully. Changes:
- "Lowest ask" → "Lowest sell price" (helper text "the cheapest you can buy it right now"); "Highest bid" → "Highest buy price" ("the most you can sell it for right now"); section headings "Sell Orders"/"Buy Orders"; the words ask/bid appear NOWHERE user-visible (grep the rendered pages).
- "Spread" stat gains inline explainer text ("gap between the lowest sell price and the highest buy price").
- ⓘ tooltips (native `title` is fine v1) on every stat card; a short "How the market works" explainer — a `/market/guide` page (5-8 plain sentences) linked from the market header.
- If Task A's `marketTrades` has rows by now, add a "Recent trades" section to the item detail (price, qty, relative+absolute time, kind="partial" rows first) — keep it simple; skip if the table is still empty and note it.

## Task G — /market/deals arbitrage page (idea 2; spec §B3)

Read spec §B3. Investigation first: what's in the `marketplaces` table (coordinates ingested? if not, extend `mapMarketplaces` mapper + worker to store x/z — `marketplace_state.coordinates` exists at source; re-run market portion or accept next-snapshot fill). Then:
- Query (`apps/web/lib/queries/deals.ts`, `unstable_cache` 1800): join sell orders × buy orders per (itemId,itemType) where buyPrice > sellPrice; compute qty=min(sellQty,buyQty), profitEach = buy − sell, profitTotal, distance (small-hex Euclidean ÷96→chunks or in tiles — pick ONE unit and label it), profitPerDistance. Exclude crossed pairs at the SAME marketplace (no travel = instant flip, show but flag). Cap result ~200 by profitTotal.
- Page `/market/deals` (SSR table, the anti-bitjita differentiator): filters min qty / min profit% / MAX profit% (kills stale-order traps) / max distance / region (GET form, mirror compendium filter idiom); columns Item (linked) | Buy at (settlement, price) | Sell at (settlement, price) | Qty | Profit | Distance | Profit/dist; plain-language row phrasing per spec ("Buy at X for 2 → sell at Y for 125"); "View route on map" link → `/map?regions={r}` (full route pins are out of scope — note it).
- Nav: add under the Data/market group wherever `/market` lives.

## Task H — Ctrl+K command palette (idea 4; spec §C1)

Global client component mounted in the site header/layout: Ctrl+K (and `/` when not in an input) opens a modal palette. Sources, all client-filtered like TypeaheadSearch: static page list (Map, Market, Deals, Calculator, Compendium sections, Settlements, Empires, Players, Leaderboards…) + the five `/api/suggest/{kind}` catalogs lazy-fetched ON OPEN (reuse `filterSuggestions`; show kind badges; Enter/click navigates). Settlements/empires/players are OUT of scope v1 (no suggest catalogs; note as follow-up). Reuse MapFinderPanel/TypeaheadSearch interaction patterns (blur/escape/arrow keys, combobox ARIA, focus trap in the dialog, body scroll lock). Footer hint "Ctrl+K" chip in the header search-less pages. Playwright-verify open/type/navigate.

## Task I — Clickable resource points with coordinates (user request 2026-06-10)

Map spawn dots (`apps/web/components/map/ResourcePointsLayer.tsx`) are a single pointer-events-none canvas — clicks must be resolved manually. Add a map click handler (inside the layer or a sibling component using `useMap`): on click, find the nearest tracked point within a hit radius (~8 px in container space; iterate the same culled/decimated in-view arrays the draw pass uses — keep them accessible, e.g. store last-drawn points in a ref). On hit, open a Leaflet popup at the point showing: tracked entity name + color dot, and the location in GAME coordinates — use the existing `formatGameCoords` helper (`apps/web/lib/format.ts`): large-tile coords, floor(smallhex/3), rendered "N{tileZ}, E{tileX}" — matching the in-game display and the settlements/empires pages (verified against live bitjita claims in commit 44e8e4f; NOT raw small-hex, NOT chunk coords, NOT real lat/long) with a "Copy" button (`navigator.clipboard`, prompt fallback pattern from MapFinderPanel). Misses do nothing (don't swallow other map interactions). Works in compact embeds too. Playwright-verify: track a resource, click a dot, popup shows plausible N/E values matching the data file's small-hex range divided by 3.

---

**Execution order:** A (time-sensitive) → B → C → D → E → F → G → H → I. Each task: implement (fresh subagent, full context in prompt) → spec review → quality review → fixes. Final: full verification (root tests, `pnpm -r typecheck`, `pnpm --filter @bcc/web build`), update spec checkboxes, report.
