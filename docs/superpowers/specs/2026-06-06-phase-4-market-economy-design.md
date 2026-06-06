# Phase 4 — Market & Economy (design)

**Date:** 2026-06-06
**Status:** Design / awaiting user review
**Pillar:** Last of the four Phase 4 pillars (crafting calculator, leaderboards + empires/players, interactive map are done).

> ⚠️ **Process note.** This spec was drafted autonomously (user stepped away mid-brainstorm).
> The clarifying questions below were resolved with explicit rationale rather than live Q&A.
> **Every decision marked 🔸 is a call I made for the user to confirm or override at the review gate.**

---

## 1. Goal & scope

Surface BitCraft's player-driven market so a player can answer: *"What does item X sell for, where, how much is available, and is the price moving?"*

The game market is a **distributed order book**: each region module (`bitcraft-live-N`) holds its own `sell_order_state` (asks) and `buy_order_state` (bids), located at marketplace buildings. There is no global price feed and **no price in the sold-listing record** — so a true price *history* does not exist in the game data; it can only be accumulated by us, going forward, from the live order book.

### In scope (v1)
- Ingest the live order book (asks + bids), marketplaces, and closed (sold) listings from all player regions.
- A global, per-item **market summary**: lowest ask, highest bid, quantity available/wanted, order counts, locations, recent sold volume.
- A **browse list** page (one row per traded item) — searchable, filterable, sortable, paginated.
- An **item detail** page — ask/bid ladders, per-location breakdown, recent sales, and a price-history chart.
- **Start accumulating price history from day one** (cheap during the snapshot we already run), with a minimal chart that grows richer as data accumulates. See §3.

### Out of scope (v1) — deferred, noted for later
- NPC / traveler shops (`traveler_trade_order_desc`, `trade_order_state`) — static + live NPC stock.
- Ephemeral player↔player trade sessions (`trade_session_state`).
- Barter stalls (`barter_stall_state`).
- Rich analytics (candlesticks, %-change indicators, moving averages, alerts). Revisit once history has accumulated.
- Visual companion mockups — explicitly declined; pages reuse the existing Compendium/Empires list+detail patterns.

---

## 2. Clarifying questions — resolved (🔸 = confirm at review)

1. **🔸 Price-history fork — the central decision.** Build the order book *and* start recording a price-history time series now, with a minimal history UI. → **Recommended Approach A (§3).** Rationale: history is **irreplaceable** — any snapshot we skip is lost forever — and capturing it is nearly free because we already run the snapshot. The *UI* for history is kept minimal (sparse at launch), which is the YAGNI-correct split: capture the cheap, irreplaceable data; defer the expensive UI until the data justifies it.
2. **🔸 Region scope.** All ~11 player regions, aggregated into a **global** per-item view, with per-region / per-marketplace breakdown on the detail page.
3. **🔸 Persist raw orders?** Yes. The detail page needs the full ask/bid ladders and per-location rows, which requires individual orders. The list page is powered by a separate **materialized per-item summary** so it never scans the 50–100k-row order book per request.
4. **🔸 Closed listings.** Persisted as `market_sales` (region-scoped). They carry item + quantity + timestamp but **no price**, so they drive *sold volume* and *recency* only — never price.
5. **🔸 NPC / barter / trade sessions.** Deferred (out of scope, above).
6. **🔸 Sentinel prices.** Observed range 1 → ~429,496,736 (≈ 2³²/10 — a sentinel/placeholder, not a real price). Orders at/above a ceiling constant are **excluded from best-price and quantity aggregates** (especially `highestBid`, where a sentinel would otherwise dominate `max`). They are still stored raw and shown (flagged) in the detail ladder.
7. **🔸 Detail route key.** `/market/<type>-<id>` where `<type>` ∈ {`item`,`cargo`} (item and cargo id-spaces overlap, so the type must be in the key). e.g. `/market/item-12345`.

---

## 3. Approaches considered (price-history fork)

**Approach A — Order book + capture history now, minimal history UI. ✅ Recommended.**
Ship the full order book (list + detail). Also write one `market_price_history` row per traded item per snapshot from day one. The v1 chart is a simple lowest-ask / highest-bid line that is sparse at launch and fills in over time.
*Pro:* captures the irreplaceable time series at almost zero marginal cost; the most-wanted economic feature (trends) starts accruing immediately. *Con:* the chart looks thin for the first days/weeks. *Verdict:* the thin-chart cost is temporary; the lost-history cost of *not* doing it is permanent.

**Approach B — Order book only, defer history entirely.**
Simplest, smallest. *Con:* permanently forfeits the early time series; adding history later still starts from zero, just later. Lower long-term value for a trivial short-term saving.

**Approach C — Order book + full historical analytics now.**
Candlesticks, %-change, moving averages up front. *Con:* every chart is empty at launch (no accumulated data yet), so the heavy UI work sits idle until data exists — premature. Fold into a later iteration once Approach A's table has weeks of data.

→ **Approach A.** It is the middle path the brainstorming fork was really asking for: capture cheaply and irreversibly now, invest in rich presentation later.

---

## 4. Data model (Drizzle — `packages/shared/src/db/schema.ts`)

Five new tables. Big-int-safe ids are strings (already handled by `extractTableInserts`/`idStr`). All prices/coins are `bigint(mode:number)`.

### 4.1 `market_orders` — the raw live order book (region-scoped, full-replace per region)
| column | type | notes |
|---|---|---|
| `entityId` | text PK | order entity id |
| `region` | text notNull | region number (module suffix); scopes the clean rebuild |
| `side` | text notNull | `'sell'` (ask) or `'buy'` (bid) |
| `itemId` | integer notNull | |
| `itemType` | integer notNull | 0=item, 1=cargo |
| `claimEntityId` | text | marketplace's claim — links to `marketplaces`/`claims` |
| `ownerEntityId` | text | order owner (player) |
| `price` | bigint notNull | Hex Coins per unit (`price_threshold`) |
| `quantity` | integer notNull | |
| `storedCoins` | bigint default 0 | escrowed coins on the order |
| `timestamp` | bigint default 0 | raw game timestamp |
| `updatedAt` | timestamp defaultNow | |

Indexes: `(itemId, itemType, side, price)` (the detail ladder + aggregation), `(region)` (clean rebuild), `(claimEntityId)` (per-location).

### 4.2 `marketplaces` — marketplace buildings (region-scoped, full-replace per region)
`buildingEntityId` text PK · `claimEntityId` text · `region` text notNull · `locationX` integer · `locationZ` integer · `updatedAt`.
Index `(region)`, `(claimEntityId)`.

### 4.3 `market_sales` — closed/sold listings (region-scoped, full-replace per region)
`entityId` text PK · `region` text notNull · `itemId` integer · `itemType` integer · `quantity` integer · `ownerEntityId` text · `claimEntityId` text · `timestamp` bigint · `updatedAt`.
*(`closed_listing_state.item_stack` is a nested struct `{item_id, quantity, item_type, durability}` — the mapper unpacks it, reusing the nested-stack decode the capsule/inventory ingest already uses.)* **No price column** (game limitation). Indexes `(itemId, itemType)`, `(region)`, `(timestamp)`.

### 4.4 `market_item_summary` — global per-item rollup (full-replace each snapshot, after the region loop)
Composite PK `(itemId, itemType)`. Powers the list page in a single fast scan.
| column | notes |
|---|---|
| `itemId`, `itemType` | PK |
| `itemName`, `itemSlug`, `iconAssetName`, `tier`, `rarity` | **denormalized** from `items`/`cargo` at aggregation time → list page needs no cross-table join and can sort/search/filter by name/tier/rarity directly |
| `lowestAsk` bigint null | min sell price below sentinel; null if no asks |
| `highestBid` bigint null | max buy price below sentinel; null if no bids |
| `askQty`, `bidQty` integer | total quantity (sentinel-excluded) |
| `askOrderCount`, `bidOrderCount` integer | |
| `regionCount`, `marketplaceCount` integer | distinct regions / claims with a live order |
| `soldQtyRecent` integer | Σ quantity from `market_sales` within the recency window |
| `lastSoldAt` bigint null | max sale timestamp |
| `updatedAt` timestamp | |
Indexes: `(lowestAsk)`, `(soldQtyRecent)`, `(tier)`, `(rarity)`, `(itemName)` for list sorting/filtering.

### 4.5 `market_price_history` — accumulating time series (append-only)
Composite PK `(itemId, itemType, snapshotAt)`. One row per traded item per snapshot.
`itemId` · `itemType` · `snapshotAt` timestamp · `lowestAsk` bigint null · `highestBid` bigint null · `askQty` int · `bidQty` int · `soldQtyRecent` int.
Index `(itemId, itemType, snapshotAt)`. Granularity = snapshot cadence. *(Future: downsample/prune old rows; not needed for v1.)*

### 4.6 Shared constant
`PRICE_SENTINEL_CEILING = 400_000_000` (in `packages/shared`). Orders with `price >= ceiling` are excluded from all best-price/quantity aggregates and flagged (not hidden) in the detail ladder.

---

## 5. Ingest pipeline (`apps/worker/src/leaderboard-snapshot.ts` + shared mappers)

Follows the proven snapshot pattern exactly (region loop → pure tested mappers → clean-rebuild upsert → post-loop global pass), mirroring how reserve-capsules and map layers are handled.

### 5.1 Source queries — add to `REGION_QUERIES`
```
SELECT * FROM sell_order_state
SELECT * FROM buy_order_state
SELECT * FROM marketplace_state
SELECT * FROM closed_listing_state
```
Bump `REGION_EXPECTED` table count accordingly.

### 5.2 Column orders — add to `packages/shared/src/ingest/column-orders.ts`
Derived from the resolved `RawModuleDefV9` schema during implementation (as every existing entry was). Expected order from exploration:
```ts
sell_order_state:   ["entity_id","owner_entity_id","claim_entity_id","item_id","item_type","price_threshold","quantity","timestamp","stored_coins"],
buy_order_state:    ["entity_id","owner_entity_id","claim_entity_id","item_id","item_type","price_threshold","quantity","timestamp","stored_coins"],
marketplace_state:  ["building_entity_id","claim_entity_id","location"],        // confirm against schema
closed_listing_state:["entity_id","owner_entity_id","claim_entity_id","item_stack","timestamp"],
```

### 5.3 Pure mappers — new `packages/shared/src/ingest/map-market.ts` (with `map-market.test.ts`)
Signature pattern matches `map-leaderboards.ts` (raw rows → typed insert objects, `idStr`/`toInt`/`bool` helpers):
- `mapMarketOrders(sellRows, buyRows, region) → MarketOrderRow[]` — tags `side`, maps `price_threshold→price`, big-int-safe ids.
- `mapMarketplaces(rows, region) → MarketplaceRow[]` — unpacks `location` → `locationX/Z`.
- `mapClosedListings(rows, region) → MarketSaleRow[]` — unpacks nested `item_stack`.

Tests cover: side tagging, big-int id preservation, sentinel passthrough (mappers store raw; sentinel filtering happens in aggregation), nested `item_stack` unpacking, missing/empty inputs.

### 5.4 Region-loop writes (inside the existing `db.transaction` per region)
Clean rebuild per region (same as players/empires):
```
DELETE market_orders  WHERE region = $region;  then chunked insert
DELETE marketplaces   WHERE region = $region;  then chunked insert
DELETE market_sales   WHERE region = $region;  then chunked insert
```

### 5.5 Post-loop global aggregation pass (after the region loop — sits beside the reserve-capsules / map passes)
A single CTE-based SQL statement (`drizzle sql\`\``), then a history append:
1. `TRUNCATE market_item_summary;` then `INSERT … SELECT` grouping `market_orders` by `(item_id,item_type)` with `FILTER (WHERE price < PRICE_SENTINEL_CEILING)` for best-price/qty aggregates, `count(DISTINCT region)`, `count(DISTINCT claim_entity_id)`; LEFT JOIN a `market_sales` window aggregate for `soldQtyRecent`/`lastSoldAt`; LEFT JOIN `items`/`cargo` (by `item_type`) for denormalized name/slug/icon/tier/rarity.
2. `INSERT INTO market_price_history SELECT itemId,itemType, <runStartedAt>, lowestAsk, highestBid, askQty, bidQty, soldQtyRecent FROM market_item_summary;`

The recency window for `soldQtyRecent` is applied at aggregation time by comparing `market_sales.timestamp` (decoded via the shared timestamp helper) to the run time. Then `triggerRevalidate` (already called at the end) refreshes the market pages.

---

## 6. Web queries (`apps/web/lib/queries/market.ts`)

Drizzle, same style as `leaderboards.ts`/`items.ts`:
- `getMarketList({ q, type, tier, rarity, sort, page })` — scans `market_item_summary` only. Sort keys: `lowestAsk` (asc, nulls last), `highestBid` (desc), `askQty`, `soldQtyRecent`, `itemName`, `tier`. `type` filters item vs cargo; `q` is `ilike` on `itemName`. Returns `{ rows, total }`.
- `getMarketItem(type, id)` — summary row + resolved item/cargo header (name, icon, tier, rarity, link back to the compendium item/cargo page).
- `getMarketOrders(type, id)` — ask ladder (`side='sell'` order by price asc) + bid ladder (`side='buy'` order by price desc), each with `quantity`; computes cumulative quantity in JS; flags rows ≥ sentinel.
- `getMarketLocations(type, id)` — group orders by `claimEntityId` joined to `marketplaces`/`claims` (claim name) → per-location best ask, best bid, qty, region.
- `getRecentSales(type, id, limit)` — latest `market_sales` rows for the item (volume/recency, no price).
- `getMarketPriceHistory(type, id)` — `market_price_history` ordered by `snapshotAt` for the chart.
- `listMarketItemKeys(limit)` — top traded `(type,id)` keys for `generateStaticParams`.

---

## 7. Web pages (`apps/web/app/market/`)

Reuse the Empires/Players list+detail components, server components, ISR.

### 7.1 `/market` — browse list (`page.tsx`)
- One row per traded item: icon + name (→ detail), tier, **lowest ask**, **highest bid**, spread (ask−bid), qty available, # orders, # marketplaces, **recent sold volume**.
- Search by name; filter by item/cargo and by tier/rarity; sortable headers; paginated. URL-param driven (same helper pattern as players page). `export const revalidate = 60`.

### 7.2 `/market/[key]` — item detail (`[key]/page.tsx`)
`key` = `<type>-<id>`. `generateStaticParams` pre-renders top-N traded items; `dynamicParams = true`; `revalidate = 300`; `generateMetadata` per item.
Sections:
1. **Header** — icon, name, tier, rarity, link to the Compendium entry; headline lowest ask / highest bid / spread / qty.
2. **Order book** — asks ladder (price asc) + bids ladder (price desc), quantity + cumulative; sentinel rows flagged.
3. **Locations** — per marketplace/claim/region: best ask, best bid, qty available.
4. **Recent sales** — latest sold (item + qty + when; *no price* — labelled so users aren't misled).
5. **Price history** — lowest-ask / highest-bid line chart over `snapshotAt`. Sparse at launch with an explanatory note ("history accrues from launch forward"); grows over time.

### 7.3 Navigation
Add `["/market", "Market"]` to `NAV` in `apps/web/components/SiteHeader.tsx` (after `/players`).

---

## 8. Testing & verification
- **Unit (Vitest, `packages/shared`):** the three pure mappers — side tagging, big-int id preservation, nested `item_stack` unpacking, sentinel passthrough, empty inputs. Matches existing mapper test density.
- **Aggregation:** a focused test/manual check that sentinel exclusion, distinct region/marketplace counts, and item/cargo name denormalization are correct on a small fixture.
- **Manual:** run the snapshot against a live region; confirm row counts in the ~50–100k order range; spot-check a known item's lowest ask/highest bid against the in-game market; confirm a second snapshot appends a new `market_price_history` slice and the chart gains a point.
- Keep `main` green: `pnpm typecheck` + `pnpm test` before each commit.

---

## 9. Migration & rollout
1. Add the five tables to `schema.ts`; `pnpm --filter @bcc/shared db:generate`.
2. Apply via the postgres apply script (not `db:push` — it aborts on PK drift, per project note).
3. Land worker ingest + mappers; run one snapshot to populate.
4. Land web queries + pages + nav.
5. Verify per §8; commit in the build-pattern order (shared → worker → web), each commit ending with
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## 10. Open items for the user (review gate)
- Confirm **Approach A** (capture history now) vs B (order book only).
- Confirm the recency window for `soldQtyRecent` / "recent sales" (proposal: **24h**; if snapshots are infrequent, widen to 7d).
- Confirm `PRICE_SENTINEL_CEILING = 400_000_000`.
- Confirm the detail route key format `/market/<type>-<id>`.
- Confirm v1 omits NPC shops, barter, and trade sessions.
