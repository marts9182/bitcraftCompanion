# Bitjita Competitive Upgrade — Design

**Date:** 2026-06-10
**Branch:** `feature/bitjita-parity` (no deploys until merge — Netlify builds only on `main`)
**Goal:** Match everything bitjita.com does, and beat it on the things players actually use — starting with resource finding on the map and a stronger market.

---

## 1. Competitive research summary

Full crawl of bitjita.com (2026-06-10): every nav section, item/claim/player/resource detail pages, the map's production JS bundles and live APIs, their public API docs, plus community sentiment (Steam reviews, JP tool roundup, competitor sites).

### What bitjita has that we don't

| Area | Their feature | Notes |
|---|---|---|
| **Map** | Resource & creature spawn-point tracking | Search any of ~513 resources / 41 creatures → every exact spawn point rendered per region (canvas + clustering), multi-track with color-coded chips, comma-separated URL params, copy-link sharing |
| **Map** | Live depletion/respawn + live player positions | Websocket (`live.bitjita.com`) — requires an always-on server we don't have on free tier |
| **Map** | GeoJSON waypoint sharing | Paste GeoJSON in URL hash or via GitHub Gist |
| **Compendium** | `/resources` + `/creatures` databases | Detail pages embed the map pre-tracking that resource — their best SEO + UX play |
| **Compendium** | `/deployables`, `/food` indexes | Food page has buff breakdowns (regen/speed numbers, durations) |
| **Market** | VWAP price stats with IQR outlier filtering | 24h/7d/30d averages with % deltas, ATH/ATL with dates, public methodology note |
| **Market** | Trade history with prices | Per-item "From → To" player-linked trades — they get prices from closed listings |
| **Market** | `/deals` arbitrage finder | Buy-low/sell-high pairs with `profit`, `profitPercent`, `distance`, `profitPerDistance`, min/max-profit + region + distance filters, map route links |
| **Market** | Order book context | Spread, largest order, depth, location → claim links, seller → player links, "Updated at" stamps, region filter |
| **Stats** | Trade volume dashboard | Volume + value over time, buy/sell splits, per-region table, top-traded-items table cross-linked to market |
| **Stats** | Hexcoin circulation (money supply) | Decomposed: inventory / claim treasury / order escrow / closed listings — needs player-inventory ingestion (heavy) |
| **Leaderboards** | Exploration, playtime (AFK split), per-item holdings | Plus "active in last 30 days" default filter and color-coded 18-skill matrix |
| **Claims** | Deep sub-pages | Members + permissions, inventories (by building + combined), buildings, construction, research, upgrade planner, storage logs; **supplies depletion projection datetime** |
| **Players** | ~20 tabs | Equipment paper-doll, vault, inventories, market orders, exploration %, buffs, quests, current location |
| **Tools** | XP calculator, settlement planner, crafting planner | Planner nets requirements against real player/claim inventories |
| **Misc** | Chat mirror, server status w/ DAU-MAU, public API (~79 endpoints), command palette | API is their ecosystem moat |

### Where we're already ahead

- **Browsable players directory** (theirs is search-only — dead end).
- **History charts** on settlements (supplies/treasury trends) — they compute a depletion time but never show the trend.
- **Slug URLs + readable names** (theirs: `/items/61508445`; ours: SEO-friendly slugs).
- **Brand-forward design** (Josefin Sans/Lexend, theme tokens) vs their utilitarian density — community criticism of dense tools ("excessive detail") is our opening.
- **Crafting calculator** with craft tree + shopping list already built.
- **SSR everywhere** — they have it too, but their deals table and tool pages are JS-only shells.

### Their weaknesses we can exploit

1. **Broken data triangle:** resource ✗→ yields, creature ✗→ loot, building ✗→ craftable recipes. The #1 wiki question ("what does this give me?") is unanswered.
2. **Map has search-by-name only** — no tier/category browse filter on the map itself.
3. **Claims list:** 1,751 rows, 88 pages, no in-page search/filters.
4. **No history charts on entity pages** (claims/empires/players).
5. **Stats hub is empty filler**; deals table is client-only (blank without JS, no SEO); 312-category sidebar with no category search.
6. Raw data leakage: "Max Health: -1", "10800.0s" instead of "3h", "T6 Unknown".
7. **Privacy-aggressive defaults** (live player location, full inventories public).

---

## 2. Strategy options considered

**A. Full parity sprint** — clone everything (chat mirror, public API, websockets, 20 player tabs, all tools) in one push. Rejected: months of work, dilutes quality, several features (websockets, inventory ingestion) don't fit the $0/month architecture.

**B. Phased "beat them where it matters"** ⬅ **CHOSEN.** Ship the highest-player-value features first — resource finding (the community's #1 demanded map feature; a browser extension exists *solely* to bolt it onto bitcraftmap), then market depth, then site-wide UX wins. Each phase beats bitjita on at least one axis, not just matches. Defer the long tail to a roadmap.

**C. Differentiation only** — skip parity, double down on polish/history-charts. Rejected: doesn't satisfy "do all of the same things," and resource finding is table stakes we genuinely lack.

---

## 3. Phase A — Resource & Creature Finder (flagship)

### A1. Data pipeline (spike first)

Resource/creature spawn points are **static locations** (nodes respawn in place). That means we do NOT need live subscriptions — a periodic snapshot suffices, which fits our worker model.

- **Spike (first task):** connect to one `bitcraft-live-*` region module and enumerate resource-related tables (`resource_desc`, `resource_state`, enemy/creature equivalents, and whatever carries positions — likely chunk/coordinate fields like the claims tables we already decode). Confirm: row counts, coordinate format, payload size per region. Output of spike = go/no-go + table list written into the implementation plan.
- **Catalog:** new `resources` (and `creatures` if available) Postgres tables from `resource_desc`-style rows: id, slug, name, category/tag, tier, rarity, max health, respawn seconds, icon ref.
- **Positions:** static GeoJSON files per `(region, resourceId)` — e.g. `apps/web/public/map/resources/r{N}/{resourceId}.json` — generated by a new manual/weekly worker job (`resource-snapshot.ts`, same pattern as `terrain-snapshot.ts`). Static files keep Neon storage flat and serve from Netlify CDN free. Lazy-loaded by the map only when a resource is tracked.
- **Budget guard:** spike must measure total static payload. If a single resource×region file exceeds ~1–2 MB, downsample render on the client (cluster), not the data.
- **Roads (spike alongside):** identify the in-game road/paved-path data source (dedicated SpacetimeDB table vs terrain-derived — bitjita ships a roads layer, so the data exists). Output: per-region road polyline GeoJSON, same static-file pattern.

### A2. Map UX (beat their version)

- **Universal map search box:** "Search resources, creatures, claims, settlements…" — keyboard navigable, grouped results with icons + tier badges.
- **Browse-by-category filter panel** (THEY DON'T HAVE THIS): pick category (Tree, Ore Vein, Flower, …) → tier → see matching resources without knowing names.
- **Tracking chips:** each tracked resource gets a colored chip ("Granite Outcrop · T1 ✕"); multiple resources/creatures tracked simultaneously, color-coded; canvas circle-marker layer + clustering for thousands of points (we already canvas-render 38k territory chunks, so the perf pattern exists in `WorldMap.tsx`).
- **Region scoping:** track in one, several, or all regions (matches their comma-separated behavior).
- **Roads layer toggle:** checkbox in the layer panel to show/hide in-game roads (players plan travel routes along them); off by default, persisted in localStorage like other layer state.
- **Shareable URLs:** `?resources=51,23&regions=7,9&center=…&zoom=…` + a "Copy link to view" button.
- **Human formatting everywhere:** respawn "3h", not "10800.0s".

### A3. Compendium pages

- **`/resources`** list: stat cards (total, categories, respawning), columns Name / Category / Tier / Rarity / Health / Respawn (humanized), category + tier filters, search — reusing our existing items-list patterns and slug routing.
- **`/resources/[slug]`** detail: stats + **embedded map pre-tracking that resource** with per-region toggles + "Open full map" deep link. This is their best page; we match it and add slug URLs + better formatting.
- **`/creatures` + `/creatures/[slug]`** if the spike finds spawn/stat data: combat stats, day/night aggro, embedded spawn map.
- **Beat-them bonus (if recipe data allows):** "Yields" section on resource pages — link extraction recipes/output items (their broken data triangle). Same for creature loot if data exists.

## 4. Phase B — Market v2

### B1. Trade prices (spike)

Bitjita shows per-trade prices; our `marketSales` ingests volume/timestamp only. **Spike:** re-inspect `closed_listing_state` rows for price fields we're dropping. If present → start ingesting price into `marketSales`; backfill impossible, so start now (every week of delay = lost history). If absent → derive stats from `marketPriceHistory` snapshots instead.

### B2. Per-item price intelligence

- 24h/7d/30d **volume-weighted averages with % change deltas**, ATH/ATL with dates, IQR outlier filtering, and a visible methodology note (match their transparency).
- Order-book stats: spread (incl. negative/crossed), largest order, order counts, buy/sell available, "Updated:" timestamp.
- Order tables: location → settlement page link + "View on map" deep link; player names → player pages (we ingest usernames already).
- Dual timestamps everywhere ("7h · Jun 10, 10:49 AM").

### B3. `/market/deals` — arbitrage finder (SSR, unlike theirs)

- Join sell orders × buy orders per item across marketplaces; emit profit, profit %, distance (marketplace coords via claims/mapClaims), and **profit-per-distance** (their best metric — keep it).
- Filters: min quantity, min/max profit % (max cap kills stale-order traps — copy this), max distance, region.
- Each row: "View route on map" deep link (start/end pins via Phase A URL params).
- **Beat:** server-rendered table (theirs is a blank JS shell), and a stale-order confidence flag (order age from snapshot history).

### B4. Market list & stats

- Category tree filter **with a category search box** (they have 312 flat categories, unsearchable), "has buy orders"/"has sell orders" toggles, per-category counts.
- **`/stats/trade-volume`:** KPI cards (volume + value, buy/sell % splits), volume/value-over-time charts from `marketPriceHistory` + sales, per-region table, top-traded-items table cross-linked to market detail. (Hexcoin money-supply dashboard deferred — needs player-inventory ingestion.)
- Stats hub `/stats` shows live headline KPIs inline (their hub is empty filler).

### B5. Plain-language market — game-native terminology

The game has **buy orders** and **sell orders**; players don't know trading-floor jargon (bitjita and our current UI both say "ask"/"bid"). Sweep all market UI:

- "Lowest ask" → **"Lowest sell price"** with helper text *"the cheapest you can buy it right now"*. "Highest bid" → **"Highest buy price"** with *"the most you can sell it for right now"*.
- Section headings mirror the in-game UI: "Sell Orders" / "Buy Orders" — the words "ask" and "bid" appear nowhere.
- "Spread" gets an inline explainer: *"gap between the lowest sell price and the highest buy price"* (negative = instant flip profit).
- ⓘ tooltips on every stat card; a short "How the market works" explainer reachable from the market header.
- Same plain-language rule on the deals page: rows read as *"Buy at {settlement} for 2 → sell at {settlement} for 125."*

## 5. Phase C — Site-wide UX wins

1. **Command palette (Ctrl+K / `/`):** global search across items, cargo, resources, players, settlements, empires, pages. Match their palette; beat it with grouped, icon-rich, keyboard-first results.
2. **Settlements:** depletion projection ("supplies run out ~Jun 26") computed from our supply history slope — they show a datetime, we show datetime + the trend chart we already have. Add tier filter alongside existing search/region.
3. **Leaderboards:** add playtime (played vs signed-in split) and exploration (if chunk data available) boards; "active last 30 days" default filter on skills board; color-coded level bands.
4. **Cross-link sweep:** every entity name anywhere is a link (market order → settlement → map; item → calculator; recipe ingredient → item; building → "craftable here" recipes — the last one beats their gap).
5. **Humanize sweep:** no raw seconds/IDs/sentinels rendered anywhere; relative+absolute timestamps; K/M number abbreviations.
6. **Homepage:** add live "pulse" row (online players, active claims, 24h trade volume) — beats their static link cards.

## 6. Phase D — Roadmap (explicitly deferred, not this branch)

- Player depth tabs (equipment, inventories, orders, exploration) — needs heavy per-player ingestion; revisit table-by-table.
- Hexcoin circulation dashboard (needs inventory escrow snapshotting).
- Per-item holdings leaderboard (same dependency).
- XP calculator, settlement planner, crafting-planner-with-inventory.
- Public API + docs (our ecosystem moat play; consider after Verified Developer token).
- Chat mirror, live websockets (requires always-on infra — incompatible with $0/month; revisit if hosting budget appears).
- Claim sub-pages: inventories, construction, research, storage logs.

## 7. Constraints & risks

| Risk | Mitigation |
|---|---|
| Resource position tables may be huge or absent in `bitcraft-live-*` modules | Phase A spike is task #1; static-GeoJSON design caps DB impact at zero either way |
| Closed listings may not carry price | Phase B spike; fall back to snapshot-derived stats; start ingestion ASAP regardless of UI timing |
| Neon free-tier storage (~1.5 GB used) | Resources/creatures positions stored as static files, not rows; catalogs are small (<1k rows) |
| GitHub Actions minutes | Resource snapshot is manual/weekly, not on the 30-min cadence |
| Marketplace coordinates needed for deals distance | We already have claim coords in `mapClaims`; join marketplaces → claims; spike confirms |
| Feature branch drift from main (recipes work in flight) | Rebase onto main when the recipes plan lands; keep phases as small mergeable commits |

## 8. Success criteria

- A player can type "iron" on the map, click a result, and see every iron-vein spawn point in their region within 2 seconds — and share that exact view as a URL.
- A trader can open `/market/deals`, filter to their region, and get a profitable, non-stale route with a map link — without JavaScript-blank tables.
- Every market item page answers: what's it worth now, what was it worth, who's selling, where, and how do I get there.
- A player who has never seen an order book understands every market label — buy/sell language only, no ask/bid jargon anywhere.
- Roads can be toggled on the map and render correctly across regions.
- No raw game-data artifacts (seconds, sentinel prices, numeric IDs) visible anywhere.
- Lighthouse/SSR parity maintained; zero new monthly cost.
