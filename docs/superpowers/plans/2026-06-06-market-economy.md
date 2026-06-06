# Market & Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface BitCraft's player-driven market — a browseable, searchable per-item view of the live order book (lowest ask / highest bid / quantity / locations / recent sold volume) plus a price-history time series we accumulate from day one.

**Architecture:** Follows the proven snapshot pipeline exactly: worker ingests the region order book → pure tested shared mappers → Drizzle tables (clean-rebuild per region) → a post-loop global SQL aggregation builds a per-item summary and appends a price-history slice → web queries → list+detail pages under `/market`. Mirrors the empires/players/capsules build pattern.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), SpacetimeDB snapshot reader, Next.js (App Router, server components), Vitest.

**Spec:** [docs/superpowers/specs/2026-06-06-phase-4-market-economy-design.md](../specs/2026-06-06-phase-4-market-economy-design.md)

**Deviation from spec (intentional):** `marketplaces` stores `building_entity_id`, `claim_entity_id`, `region` only — **coordinates are deferred** (the `marketplace_state.location` wire format is unverified and v1's location display uses the claim name + region from the existing `claims` table, not coordinates). All other spec decisions stand. The spec's §4.2 has been updated to match.

---

## File structure

**Created:**
- `packages/shared/src/ingest/map-market.ts` — pure mappers + constants (`PRICE_SENTINEL_CEILING`, `gameTimestampToMs`, `mapMarketOrders`, `mapMarketplaces`, `mapClosedListings`).
- `packages/shared/src/ingest/map-market.test.ts` — mapper unit tests.
- `apps/web/lib/market/params.ts` — list params parsing + route-key helpers.
- `apps/web/lib/queries/market.ts` — web read queries.
- `apps/web/components/market/MarketPriceChart.tsx` — minimal SVG price chart.
- `apps/web/app/market/page.tsx` — browse list.
- `apps/web/app/market/[key]/page.tsx` — item detail.

**Modified:**
- `packages/shared/src/ingest/column-orders.ts` — add 4 source-table column orders.
- `packages/shared/src/db/schema.ts` — add 5 tables.
- `packages/shared/src/index.ts` — export new market symbols.
- `apps/worker/src/leaderboard-snapshot.ts` — add region queries, region-loop writes, post-loop aggregation.
- `apps/web/components/SiteHeader.tsx` — add `/market` nav entry.

---

## Task 1: Shared market mappers (TDD)

**Files:**
- Create: `packages/shared/src/ingest/map-market.ts`
- Test: `packages/shared/src/ingest/map-market.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/ingest/map-market.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  mapMarketOrders,
  mapMarketplaces,
  mapClosedListings,
  gameTimestampToMs,
  PRICE_SENTINEL_CEILING,
} from "./map-market";

describe("mapMarketOrders", () => {
  it("tags side, maps price_threshold→price, preserves big-int ids as strings", () => {
    const sells = [{
      entity_id: "72057594037927936", owner_entity_id: "123", claim_entity_id: "456",
      item_id: 10, item_type: 0, price_threshold: 250, quantity: 4, timestamp: 1700000000000000, stored_coins: 0,
    }];
    const buys = [{
      entity_id: "999", owner_entity_id: "5", claim_entity_id: "456",
      item_id: 10, item_type: 0, price_threshold: 100, quantity: 2, timestamp: 1700000000000001, stored_coins: 50,
    }];
    const rows = mapMarketOrders(sells, buys, "7");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      entityId: "72057594037927936", side: "sell", itemId: 10, itemType: 0,
      claimEntityId: "456", ownerEntityId: "123", price: 250, quantity: 4, region: "7",
    });
    expect(rows[1]).toMatchObject({ side: "buy", price: 100, storedCoins: 50 });
  });

  it("skips rows with no item id", () => {
    expect(mapMarketOrders([{ entity_id: "1" }], [], "7")).toEqual([]);
  });
});

describe("mapMarketplaces", () => {
  it("maps building/claim/region with big-int-safe ids", () => {
    const rows = mapMarketplaces([{ building_entity_id: "72057594000000001", claim_entity_id: "8" }], "7");
    expect(rows).toEqual([{ buildingEntityId: "72057594000000001", claimEntityId: "8", region: "7" }]);
  });
});

describe("mapClosedListings", () => {
  it("unpacks a keyed item_stack object", () => {
    const rows = mapClosedListings(
      [{ entity_id: "1", owner_entity_id: "2", claim_entity_id: "3", item_stack: { item_id: 10, quantity: 5, item_type: 1 }, timestamp: 1700000000000000 }],
      "7",
    );
    expect(rows).toEqual([{ entityId: "1", region: "7", itemId: 10, itemType: 1, quantity: 5, ownerEntityId: "2", claimEntityId: "3", timestamp: 1700000000000000 }]);
  });

  it("unpacks a positional item_stack array [item_id, quantity, item_type, durability]", () => {
    const rows = mapClosedListings(
      [{ entity_id: "1", owner_entity_id: "2", claim_entity_id: "3", item_stack: [10, 5, 0, 1000], timestamp: 1 }],
      "7",
    );
    expect(rows[0]).toMatchObject({ itemId: 10, quantity: 5, itemType: 0 });
  });

  it("skips listings with no item id", () => {
    expect(mapClosedListings([{ entity_id: "1", item_stack: null, timestamp: 1 }], "7")).toEqual([]);
  });
});

describe("gameTimestampToMs", () => {
  it("converts SpacetimeDB microsecond timestamps to JS milliseconds", () => {
    expect(gameTimestampToMs(1700000000000000)).toBe(1700000000000);
    expect(gameTimestampToMs(null)).toBe(0);
  });
});

describe("PRICE_SENTINEL_CEILING", () => {
  it("is below the observed ~429M placeholder", () => {
    expect(PRICE_SENTINEL_CEILING).toBe(400_000_000);
    expect(PRICE_SENTINEL_CEILING).toBeLessThan(429_496_736);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bcc/shared test -- map-market`
Expected: FAIL — `Cannot find module './map-market'`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/ingest/map-market.ts`:

```ts
import { toInt } from "./decode";

type Raw = Record<string, unknown>;
const idStr = (v: unknown): string => (v == null ? "" : String(v));

/** Prices at/above this are treated as sentinels/placeholders (observed ~429M ≈ 2³²/10),
 *  excluded from best-price/quantity aggregates, flagged (not hidden) in the order ladder. */
export const PRICE_SENTINEL_CEILING = 400_000_000;

/** SpacetimeDB Timestamp is microseconds since the Unix epoch → JS milliseconds. */
export function gameTimestampToMs(ts: unknown): number {
  return (toInt(ts) ?? 0) / 1000;
}

export interface MarketOrderRow {
  entityId: string;
  region: string;
  side: "sell" | "buy";
  itemId: number;
  itemType: number;
  claimEntityId: string;
  ownerEntityId: string;
  price: number;
  quantity: number;
  storedCoins: number;
  timestamp: number;
}

function mapOrderSide(rows: Raw[], side: "sell" | "buy", region: string): MarketOrderRow[] {
  const out: MarketOrderRow[] = [];
  for (const r of rows) {
    const itemId = toInt(r.item_id);
    if (itemId == null) continue;
    out.push({
      entityId: idStr(r.entity_id),
      region,
      side,
      itemId,
      itemType: toInt(r.item_type) ?? 0,
      claimEntityId: idStr(r.claim_entity_id),
      ownerEntityId: idStr(r.owner_entity_id),
      price: toInt(r.price_threshold) ?? 0,
      quantity: toInt(r.quantity) ?? 0,
      storedCoins: toInt(r.stored_coins) ?? 0,
      timestamp: toInt(r.timestamp) ?? 0,
    });
  }
  return out;
}

/** Combine asks (sell_order_state) + bids (buy_order_state) into one order list. */
export function mapMarketOrders(sellRows: Raw[], buyRows: Raw[], region: string): MarketOrderRow[] {
  return [...mapOrderSide(sellRows, "sell", region), ...mapOrderSide(buyRows, "buy", region)];
}

export interface MarketplaceRow {
  buildingEntityId: string;
  claimEntityId: string;
  region: string;
}
export function mapMarketplaces(rows: Raw[], region: string): MarketplaceRow[] {
  return rows.map((r) => ({
    buildingEntityId: idStr(r.building_entity_id),
    claimEntityId: idStr(r.claim_entity_id),
    region,
  }));
}

export interface MarketSaleRow {
  entityId: string;
  region: string;
  itemId: number;
  itemType: number;
  quantity: number;
  ownerEntityId: string;
  claimEntityId: string;
  timestamp: number;
}

/** Read an item_stack that may be a positional array [item_id, quantity, item_type, durability]
 *  or a keyed object {item_id, quantity, item_type}. Null if no item id. */
function readStack(stack: unknown): { itemId: number; quantity: number; itemType: number } | null {
  if (Array.isArray(stack)) {
    const itemId = toInt(stack[0]);
    if (itemId == null) return null;
    return { itemId, quantity: toInt(stack[1]) ?? 0, itemType: toInt(stack[2]) ?? 0 };
  }
  if (stack && typeof stack === "object") {
    const o = stack as Raw;
    const itemId = toInt(o.item_id);
    if (itemId == null) return null;
    return { itemId, quantity: toInt(o.quantity) ?? 0, itemType: toInt(o.item_type) ?? 0 };
  }
  return null;
}

/** Map closed_listing_state → sales (item + qty + when; NO price exists in the source). */
export function mapClosedListings(rows: Raw[], region: string): MarketSaleRow[] {
  const out: MarketSaleRow[] = [];
  for (const r of rows) {
    const stack = readStack(r.item_stack);
    if (!stack) continue;
    out.push({
      entityId: idStr(r.entity_id),
      region,
      itemId: stack.itemId,
      itemType: stack.itemType,
      quantity: stack.quantity,
      ownerEntityId: idStr(r.owner_entity_id),
      claimEntityId: idStr(r.claim_entity_id),
      timestamp: toInt(r.timestamp) ?? 0,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bcc/shared test -- map-market`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ingest/map-market.ts packages/shared/src/ingest/map-market.test.ts
git commit -m "$(cat <<'EOF'
feat(market): pure mappers for order book, marketplaces, closed listings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Source column orders + barrel exports

**Files:**
- Modify: `packages/shared/src/ingest/column-orders.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add column orders**

In `packages/shared/src/ingest/column-orders.ts`, add these entries inside the `COLUMN_ORDERS` object (after `terrain_chunk_state`). The order matches the resolved `RawModuleDefV9` schema as observed in exploration; `marketplace_state` is finalized against the schema at run time (see Task 6 verification):

```ts
  sell_order_state: ["entity_id", "owner_entity_id", "claim_entity_id", "item_id", "item_type", "price_threshold", "quantity", "timestamp", "stored_coins"],
  buy_order_state: ["entity_id", "owner_entity_id", "claim_entity_id", "item_id", "item_type", "price_threshold", "quantity", "timestamp", "stored_coins"],
  marketplace_state: ["building_entity_id", "claim_entity_id", "location"],
  closed_listing_state: ["entity_id", "owner_entity_id", "claim_entity_id", "item_stack", "timestamp"],
```

- [ ] **Step 2: Export new symbols**

In `packages/shared/src/index.ts`, add after the `map-world` exports (lines ~34-35):

```ts
export {
  mapMarketOrders,
  mapMarketplaces,
  mapClosedListings,
  gameTimestampToMs,
  PRICE_SENTINEL_CEILING,
} from "./ingest/map-market";
export type { MarketOrderRow, MarketplaceRow, MarketSaleRow } from "./ingest/map-market";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ingest/column-orders.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(market): source column orders + barrel exports for market mappers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Drizzle schema (5 tables) + migration

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Create (generated): `packages/shared/drizzle/<NNNN>_*.sql`

- [ ] **Step 1: Add the tables**

Append to `packages/shared/src/db/schema.ts` (end of file). `primaryKey` and `index` are already imported on line 1:

```ts
/** Live player order book — asks (side='sell') + bids (side='buy'). Region-scoped clean-rebuild. */
export const marketOrders = pgTable(
  "market_orders",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    side: text("side").notNull(), // 'sell' | 'buy'
    itemId: integer("item_id").notNull(),
    itemType: integer("item_type").notNull().default(0), // 0=item, 1=cargo
    claimEntityId: text("claim_entity_id"),
    ownerEntityId: text("owner_entity_id"),
    price: bigint("price", { mode: "number" }).notNull().default(0), // Hex Coins per unit
    quantity: integer("quantity").notNull().default(0),
    storedCoins: bigint("stored_coins", { mode: "number" }).notNull().default(0),
    timestamp: bigint("timestamp", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byItem: index("market_orders_item_idx").on(t.itemId, t.itemType, t.side, t.price),
    byRegion: index("market_orders_region_idx").on(t.region),
    byClaim: index("market_orders_claim_idx").on(t.claimEntityId),
  }),
);

/** Marketplace buildings (region-scoped clean-rebuild). Coordinates deferred (v1). */
export const marketplaces = pgTable(
  "marketplaces",
  {
    buildingEntityId: text("building_entity_id").primaryKey(),
    claimEntityId: text("claim_entity_id"),
    region: text("region").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byRegion: index("marketplaces_region_idx").on(t.region),
    byClaim: index("marketplaces_claim_idx").on(t.claimEntityId),
  }),
);

/** Closed/sold listings — volume + recency only (NO price in source). Region-scoped clean-rebuild. */
export const marketSales = pgTable(
  "market_sales",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    itemId: integer("item_id").notNull(),
    itemType: integer("item_type").notNull().default(0),
    quantity: integer("quantity").notNull().default(0),
    ownerEntityId: text("owner_entity_id"),
    claimEntityId: text("claim_entity_id"),
    timestamp: bigint("timestamp", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byItem: index("market_sales_item_idx").on(t.itemId, t.itemType),
    byRegion: index("market_sales_region_idx").on(t.region),
    byTime: index("market_sales_time_idx").on(t.timestamp),
  }),
);

/** Global per-item rollup (full-replace each snapshot). Denormalized name/icon/tier/rarity
 *  so the list page is a single fast scan. */
export const marketItemSummary = pgTable(
  "market_item_summary",
  {
    itemId: integer("item_id").notNull(),
    itemType: integer("item_type").notNull(),
    itemName: text("item_name").notNull().default(""),
    itemSlug: text("item_slug").notNull().default(""),
    iconAssetName: text("icon_asset_name"),
    tier: integer("tier"),
    rarity: text("rarity").notNull().default("Default"),
    lowestAsk: bigint("lowest_ask", { mode: "number" }),
    highestBid: bigint("highest_bid", { mode: "number" }),
    askQty: integer("ask_qty").notNull().default(0),
    bidQty: integer("bid_qty").notNull().default(0),
    askOrderCount: integer("ask_order_count").notNull().default(0),
    bidOrderCount: integer("bid_order_count").notNull().default(0),
    regionCount: integer("region_count").notNull().default(0),
    marketplaceCount: integer("marketplace_count").notNull().default(0),
    soldQtyRecent: integer("sold_qty_recent").notNull().default(0),
    lastSoldAt: bigint("last_sold_at", { mode: "number" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.itemType] }),
    byAsk: index("market_summary_ask_idx").on(t.lowestAsk),
    bySold: index("market_summary_sold_idx").on(t.soldQtyRecent),
    byTier: index("market_summary_tier_idx").on(t.tier),
    byRarity: index("market_summary_rarity_idx").on(t.rarity),
    byName: index("market_summary_name_idx").on(t.itemName),
  }),
);

/** Append-only price-history time series (one row per traded item per snapshot). */
export const marketPriceHistory = pgTable(
  "market_price_history",
  {
    itemId: integer("item_id").notNull(),
    itemType: integer("item_type").notNull(),
    snapshotAt: timestamp("snapshot_at").notNull(),
    lowestAsk: bigint("lowest_ask", { mode: "number" }),
    highestBid: bigint("highest_bid", { mode: "number" }),
    askQty: integer("ask_qty").notNull().default(0),
    bidQty: integer("bid_qty").notNull().default(0),
    soldQtyRecent: integer("sold_qty_recent").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.itemType, t.snapshotAt] }),
    byItem: index("market_history_item_idx").on(t.itemId, t.itemType, t.snapshotAt),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @bcc/shared db:generate`
Expected: a new `packages/shared/drizzle/<NNNN>_*.sql` is created containing `CREATE TABLE IF NOT EXISTS "market_orders" …` for all five tables. Note the exact filename printed.

- [ ] **Step 3: Apply the migration**

Run (substitute the filename from Step 2; `db:push` is NOT used — it aborts on the uuid-PK drift):
```bash
node packages/shared/scripts/apply-sql.mjs drizzle/<NNNN>_*.sql
```
Expected: `[apply-sql] applied N statements from drizzle/<NNNN>_*.sql`.

- [ ] **Step 4: Verify tables exist**

Run:
```bash
node -e "import('postgres').then(async({default:p})=>{const{config}=await import('dotenv');config({path:'.env.local'});const sql=p(process.env.DATABASE_URL,{prepare:false});const r=await sql\`select table_name from information_schema.tables where table_name like 'market%' or table_name='marketplaces' order by table_name\`;console.log(r.map(x=>x.table_name));await sql.end();})"
```
Expected: `[ 'market_item_summary', 'market_orders', 'market_price_history', 'market_sales', 'marketplaces' ]`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle/
git commit -m "$(cat <<'EOF'
feat(market): drizzle tables for orders, marketplaces, sales, summary, history

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Worker region-loop ingest

**Files:**
- Modify: `apps/worker/src/leaderboard-snapshot.ts`

- [ ] **Step 1: Import the mappers**

In the `@bcc/shared` import block (lines 6-11), add the market mappers and constant. Change the line:

```ts
  mapClaimLocalRows, mapChunkRows, mapRegionRows, buildEmpireColors, regionNamesById, type MapChunkRow, type MapRegionRow,
```
to:
```ts
  mapClaimLocalRows, mapChunkRows, mapRegionRows, buildEmpireColors, regionNamesById, type MapChunkRow, type MapRegionRow,
  mapMarketOrders, mapMarketplaces, mapClosedListings, PRICE_SENTINEL_CEILING,
```

- [ ] **Step 2: Add the region queries**

In `REGION_QUERIES` (ends at line 49), add before the closing `]`:

```ts
  // Market: live order book + marketplaces + closed (sold) listings.
  "SELECT * FROM sell_order_state",
  "SELECT * FROM buy_order_state",
  "SELECT * FROM marketplace_state",
  "SELECT * FROM closed_listing_state",
```

- [ ] **Step 3: Map the rows in the region loop**

Inside the region loop, after the existing `claimRows` mapping (around line 164, before `totalPlayers += playerRows.length;`), add:

```ts
      const marketOrderRows = dedupeBy(mapMarketOrders(norm(r, "sell_order_state"), norm(r, "buy_order_state"), region), (o) => o.entityId);
      const marketplaceRows = dedupeBy(mapMarketplaces(norm(r, "marketplace_state"), region), (m) => m.buildingEntityId);
      const marketSaleRows = dedupeBy(mapClosedListings(norm(r, "closed_listing_state"), region), (s) => s.entityId);
```

- [ ] **Step 4: Clean-rebuild writes inside the per-region transaction**

In the `db.transaction` block, add these deletes alongside the existing region deletes (after the `schema.empires` delete, ~line 195):

```ts
        await tx.delete(schema.marketOrders).where(eq(schema.marketOrders.region, region));
        await tx.delete(schema.marketplaces).where(eq(schema.marketplaces.region, region));
        await tx.delete(schema.marketSales).where(eq(schema.marketSales.region, region));
```

Then add these inserts after the `schema.claimMembers` insert (~line 225, before the `schema.regions` upsert):

```ts
        await inChunks(marketOrderRows, CHUNK, (s) =>
          tx.insert(schema.marketOrders).values(s).onConflictDoUpdate({ target: schema.marketOrders.entityId, set: conflictUpdateSet(schema.marketOrders, ["entityId"]) }),
        );
        await inChunks(marketplaceRows, CHUNK, (s) =>
          tx.insert(schema.marketplaces).values(s).onConflictDoUpdate({ target: schema.marketplaces.buildingEntityId, set: conflictUpdateSet(schema.marketplaces, ["buildingEntityId"]) }),
        );
        await inChunks(marketSaleRows, CHUNK, (s) =>
          tx.insert(schema.marketSales).values(s).onConflictDoUpdate({ target: schema.marketSales.entityId, set: conflictUpdateSet(schema.marketSales, ["entityId"]) }),
        );
```

- [ ] **Step 5: Add counts to the per-region log line**

Change the region log line (~line 231) to include market counts:

```ts
      console.log(`[lb-snapshot]   region ${region}: players=${playerRows.length} skills=${playerSkillRows.length} empires=${empires.length} claims=${claimRows.length} mapClaims=${mapClaimData.length} orders=${marketOrderRows.length} sales=${marketSaleRows.length}`);
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS. (`PRICE_SENTINEL_CEILING` is imported but unused until Task 5 — if the worker's tsconfig flags unused imports, it will be used in Task 5; if typecheck fails on no-unused, complete Task 5 before this check. Otherwise PASS.)

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/leaderboard-snapshot.ts
git commit -m "$(cat <<'EOF'
feat(market): ingest order book, marketplaces, sales per region

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Worker post-loop aggregation + price history

**Files:**
- Modify: `apps/worker/src/leaderboard-snapshot.ts`

- [ ] **Step 1: Add the aggregation pass**

After the map write transaction (~line 301, after `console.log(\`[lb-snapshot] map: …\`)`) and before the `ingestionRuns` "ok" update (~line 303), insert:

```ts
    // ── Market: global per-item summary + price-history slice (after all regions) ──
    const MARKET_WINDOW_MS = 24 * 60 * 60 * 1000;
    const marketCutoffTs = (Date.now() - MARKET_WINDOW_MS) * 1000; // micros since epoch (SpacetimeDB Timestamp)
    await db.execute(sql`TRUNCATE market_item_summary`);
    await db.execute(sql`
      WITH agg AS (
        SELECT item_id, item_type,
          min(price) FILTER (WHERE side = 'sell' AND price < ${PRICE_SENTINEL_CEILING}) AS lowest_ask,
          max(price) FILTER (WHERE side = 'buy'  AND price < ${PRICE_SENTINEL_CEILING}) AS highest_bid,
          COALESCE(sum(quantity) FILTER (WHERE side = 'sell' AND price < ${PRICE_SENTINEL_CEILING}), 0)::int AS ask_qty,
          COALESCE(sum(quantity) FILTER (WHERE side = 'buy'  AND price < ${PRICE_SENTINEL_CEILING}), 0)::int AS bid_qty,
          count(*) FILTER (WHERE side = 'sell')::int AS ask_orders,
          count(*) FILTER (WHERE side = 'buy')::int  AS bid_orders,
          count(DISTINCT region)::int AS region_count,
          count(DISTINCT claim_entity_id)::int AS marketplace_count
        FROM market_orders
        GROUP BY item_id, item_type
      ),
      sales AS (
        SELECT item_id, item_type, sum(quantity)::int AS sold_qty, max(timestamp) AS last_sold
        FROM market_sales
        WHERE timestamp >= ${marketCutoffTs}
        GROUP BY item_id, item_type
      )
      INSERT INTO market_item_summary (
        item_id, item_type, item_name, item_slug, icon_asset_name, tier, rarity,
        lowest_ask, highest_bid, ask_qty, bid_qty, ask_order_count, bid_order_count,
        region_count, marketplace_count, sold_qty_recent, last_sold_at, updated_at
      )
      SELECT a.item_id, a.item_type,
        COALESCE(i.name, c.name, ''), COALESCE(i.slug, c.slug, ''),
        COALESCE(i.icon_asset_name, c.icon_asset_name),
        COALESCE(i.tier, c.tier), COALESCE(i.rarity, c.rarity, 'Default'),
        a.lowest_ask, a.highest_bid, a.ask_qty, a.bid_qty, a.ask_orders, a.bid_orders,
        a.region_count, a.marketplace_count,
        COALESCE(s.sold_qty, 0), s.last_sold, now()
      FROM agg a
      LEFT JOIN items i ON a.item_type = 0 AND i.id = a.item_id
      LEFT JOIN cargo c ON a.item_type = 1 AND c.id = a.item_id
      LEFT JOIN sales s ON s.item_id = a.item_id AND s.item_type = a.item_type
    `);
    await db.execute(sql`
      INSERT INTO market_price_history (item_id, item_type, snapshot_at, lowest_ask, highest_bid, ask_qty, bid_qty, sold_qty_recent)
      SELECT item_id, item_type, ${run!.startedAt}, lowest_ask, highest_bid, ask_qty, bid_qty, sold_qty_recent
      FROM market_item_summary
      ON CONFLICT (item_id, item_type, snapshot_at) DO NOTHING
    `);
    const [{ count: marketSummaryCount }] = await db.execute(sql`SELECT count(*)::int AS count FROM market_item_summary`) as unknown as { count: number }[];
    console.log(`[lb-snapshot] market: ${marketSummaryCount} traded items summarized + price-history slice appended`);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS. (`sql` is already imported from `drizzle-orm` on line 15; `PRICE_SENTINEL_CEILING` is now used.)

> Note on the `db.execute` return shape: with the postgres-js driver Drizzle returns the rows array directly, so `[{ count }]` destructuring works. If at run time (Task 6) `marketSummaryCount` is `undefined`, change the read to `const res = await db.execute(...)` then `const marketSummaryCount = (res as unknown as {count:number}[])[0]?.count ?? 0;` — a logging-only concern that does not affect the data written.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/leaderboard-snapshot.ts
git commit -m "$(cat <<'EOF'
feat(market): post-loop summary aggregation + price-history append

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Run a snapshot to populate + verify ingest

**Files:** none (verification task)

- [ ] **Step 1: Run a single snapshot**

Run (this connects to live SpacetimeDB; allow a few minutes):
```bash
pnpm --filter @bcc/worker snapshot
```
> If the worker has no `snapshot` script, run the entry directly, e.g. `pnpm --filter @bcc/worker exec tsx src/leaderboard-snapshot.ts`. Check `apps/worker/package.json` scripts for the exact name.
Expected: per-region log lines now include `orders=… sales=…`, and a final `[lb-snapshot] market: N traded items summarized + price-history slice appended` with N in the thousands.

- [ ] **Step 2: Verify the column order assumption held**

Run:
```bash
node -e "import('postgres').then(async({default:p})=>{const{config}=await import('dotenv');config({path:'.env.local'});const sql=p(process.env.DATABASE_URL,{prepare:false});const r=await sql\`select item_id,item_name,lowest_ask,highest_bid,ask_qty,sold_qty_recent,marketplace_count from market_item_summary where item_name <> '' order by sold_qty_recent desc limit 10\`;console.table(r);const bad=await sql\`select count(*)::int c from market_item_summary where item_name=''\`;console.log('unnamed rows:',bad[0].c);await sql.end();})"
```
Expected: a table of recognizable item names with sane `lowest_ask` values (small-to-moderate integers, none ≥ 400,000,000) and non-zero `sold_qty_recent` for the top rows. If `item_name` is blank for most rows, or `lowest_ask` looks like ids/timestamps, the `marketplace_state`/order column order is wrong — fix the affected entry in `column-orders.ts` against the resolved schema and re-run Step 1.

- [ ] **Step 3: Verify history is accumulating**

Run the snapshot a second time (Step 1), then:
```bash
node -e "import('postgres').then(async({default:p})=>{const{config}=await import('dotenv');config({path:'.env.local'});const sql=p(process.env.DATABASE_URL,{prepare:false});const r=await sql\`select count(distinct snapshot_at)::int slices, count(*)::int rows from market_price_history\`;console.log(r[0]);await sql.end();})"
```
Expected: `slices` ≥ 2 (two distinct snapshot timestamps), confirming the time series appends.

- [ ] **Step 4: Commit any column-order fix (only if Step 2 required one)**

```bash
git add packages/shared/src/ingest/column-orders.ts
git commit -m "$(cat <<'EOF'
fix(market): correct source column order from resolved schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Web queries + params

**Files:**
- Create: `apps/web/lib/market/params.ts`
- Create: `apps/web/lib/queries/market.ts`

- [ ] **Step 1: Create the params + key helpers**

Create `apps/web/lib/market/params.ts`:

```ts
export const MARKET_PAGE_SIZE = 100;
export const MARKET_SORTS = ["sold", "ask", "bid", "askQty", "name", "tier"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];
export const MARKET_TYPES = ["all", "item", "cargo"] as const;
export type MarketTypeFilter = (typeof MARKET_TYPES)[number];

export interface MarketListParams {
  q: string;
  type: MarketTypeFilter;
  sort: MarketSort;
  page: number;
}

export function parseMarketParams(sp: Record<string, string | string[] | undefined>): MarketListParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() ?? "";
  const typeRaw = one(sp.type) as MarketTypeFilter | undefined;
  const type = typeRaw && (MARKET_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "all";
  const sortRaw = one(sp.sort) as MarketSort | undefined;
  const sort = sortRaw && (MARKET_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "sold";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { q, type, sort, page };
}

/** Detail route key <type>-<id>. item_type 1 = cargo, else item. */
export function marketKey(itemType: number, itemId: number): string {
  return `${itemType === 1 ? "cargo" : "item"}-${itemId}`;
}
export function parseMarketKey(key: string): { itemType: number; itemId: number } | null {
  const m = /^(item|cargo)-(\d+)$/.exec(key);
  if (!m) return null;
  return { itemType: m[1] === "cargo" ? 1 : 0, itemId: Number(m[2]) };
}
```

- [ ] **Step 2: Create the queries**

Create `apps/web/lib/queries/market.ts`:

```ts
import "server-only";
import { and, asc, desc, eq, ilike, sql, count } from "drizzle-orm";
import { PRICE_SENTINEL_CEILING } from "@bcc/shared";
import { getDb, schema } from "@/lib/db";
import { MARKET_PAGE_SIZE, type MarketListParams } from "@/lib/market/params";

const { marketItemSummary, marketOrders, marketSales, marketPriceHistory, claims } = schema;

export type MarketSummaryRow = typeof marketItemSummary.$inferSelect;

export async function getMarketList(params: MarketListParams): Promise<{ rows: MarketSummaryRow[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(marketItemSummary.itemName, `%${params.q}%`));
  if (params.type === "item") conds.push(eq(marketItemSummary.itemType, 0));
  if (params.type === "cargo") conds.push(eq(marketItemSummary.itemType, 1));
  const where = conds.length ? and(...conds) : undefined;

  const orderBy =
    params.sort === "ask" ? sql`${marketItemSummary.lowestAsk} asc nulls last` :
    params.sort === "bid" ? desc(marketItemSummary.highestBid) :
    params.sort === "askQty" ? desc(marketItemSummary.askQty) :
    params.sort === "name" ? asc(marketItemSummary.itemName) :
    params.sort === "tier" ? desc(marketItemSummary.tier) :
    desc(marketItemSummary.soldQtyRecent);

  const [{ total }] = await db.select({ total: count() }).from(marketItemSummary).where(where);
  const rows = await db
    .select()
    .from(marketItemSummary)
    .where(where)
    .orderBy(orderBy, asc(marketItemSummary.itemName))
    .limit(MARKET_PAGE_SIZE)
    .offset((params.page - 1) * MARKET_PAGE_SIZE);
  return { rows, total: Number(total) };
}

export async function getMarketItem(itemType: number, itemId: number): Promise<MarketSummaryRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(marketItemSummary)
    .where(and(eq(marketItemSummary.itemType, itemType), eq(marketItemSummary.itemId, itemId)))
    .limit(1);
  return row ?? null;
}

export interface OrderLadderRow { price: number; quantity: number; cumulative: number; sentinel: boolean; }

export async function getMarketOrders(itemType: number, itemId: number): Promise<{ asks: OrderLadderRow[]; bids: OrderLadderRow[] }> {
  const db = getDb();
  const rows = await db
    .select({ side: marketOrders.side, price: marketOrders.price, quantity: marketOrders.quantity })
    .from(marketOrders)
    .where(and(eq(marketOrders.itemType, itemType), eq(marketOrders.itemId, itemId)));

  const build = (side: "sell" | "buy"): OrderLadderRow[] => {
    const levels = new Map<number, number>();
    for (const r of rows) if (r.side === side) levels.set(r.price, (levels.get(r.price) ?? 0) + r.quantity);
    const sorted = [...levels.entries()].sort((a, b) => (side === "sell" ? a[0] - b[0] : b[0] - a[0]));
    let cum = 0;
    return sorted.map(([price, quantity]) => {
      cum += quantity;
      return { price, quantity, cumulative: cum, sentinel: price >= PRICE_SENTINEL_CEILING };
    });
  };
  return { asks: build("sell"), bids: build("buy") };
}

export interface MarketLocationRow { claimEntityId: string; claimName: string; region: string; bestAsk: number | null; askQty: number; }

export async function getMarketLocations(itemType: number, itemId: number): Promise<MarketLocationRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      claimEntityId: marketOrders.claimEntityId,
      region: marketOrders.region,
      claimName: claims.name,
      bestAsk: sql<number | null>`min(${marketOrders.price}) FILTER (WHERE ${marketOrders.side} = 'sell' AND ${marketOrders.price} < ${PRICE_SENTINEL_CEILING})`,
      askQty: sql<number>`COALESCE(sum(${marketOrders.quantity}) FILTER (WHERE ${marketOrders.side} = 'sell' AND ${marketOrders.price} < ${PRICE_SENTINEL_CEILING}), 0)::int`,
    })
    .from(marketOrders)
    .leftJoin(claims, eq(claims.entityId, marketOrders.claimEntityId))
    .where(and(eq(marketOrders.itemType, itemType), eq(marketOrders.itemId, itemId)))
    .groupBy(marketOrders.claimEntityId, marketOrders.region, claims.name)
    .orderBy(sql`min(${marketOrders.price}) FILTER (WHERE ${marketOrders.side} = 'sell' AND ${marketOrders.price} < ${PRICE_SENTINEL_CEILING}) asc nulls last`);
  return rows.map((r) => ({
    claimEntityId: r.claimEntityId ?? "",
    claimName: r.claimName ?? "",
    region: r.region,
    bestAsk: r.bestAsk,
    askQty: r.askQty,
  }));
}

export interface RecentSaleRow { quantity: number; timestamp: number; region: string; }

export async function getRecentSales(itemType: number, itemId: number, limit = 20): Promise<RecentSaleRow[]> {
  const db = getDb();
  return db
    .select({ quantity: marketSales.quantity, timestamp: marketSales.timestamp, region: marketSales.region })
    .from(marketSales)
    .where(and(eq(marketSales.itemType, itemType), eq(marketSales.itemId, itemId)))
    .orderBy(desc(marketSales.timestamp))
    .limit(limit);
}

export interface PricePoint { snapshotAt: Date; lowestAsk: number | null; highestBid: number | null; soldQtyRecent: number; }

export async function getMarketPriceHistory(itemType: number, itemId: number): Promise<PricePoint[]> {
  const db = getDb();
  return db
    .select({
      snapshotAt: marketPriceHistory.snapshotAt,
      lowestAsk: marketPriceHistory.lowestAsk,
      highestBid: marketPriceHistory.highestBid,
      soldQtyRecent: marketPriceHistory.soldQtyRecent,
    })
    .from(marketPriceHistory)
    .where(and(eq(marketPriceHistory.itemType, itemType), eq(marketPriceHistory.itemId, itemId)))
    .orderBy(asc(marketPriceHistory.snapshotAt));
}

export async function listMarketItemKeys(limit = 500): Promise<{ itemType: number; itemId: number }[]> {
  const db = getDb();
  return db
    .select({ itemType: marketItemSummary.itemType, itemId: marketItemSummary.itemId })
    .from(marketItemSummary)
    .orderBy(desc(marketItemSummary.soldQtyRecent))
    .limit(limit);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/market/params.ts apps/web/lib/queries/market.ts
git commit -m "$(cat <<'EOF'
feat(market): web read queries + list params/route-key helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Market browse list page

**Files:**
- Create: `apps/web/app/market/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/app/market/page.tsx` (modeled on `apps/web/app/empires/page.tsx`):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { Pager } from "@/components/compendium/Pager";
import { getMarketList } from "@/lib/queries/market";
import { MARKET_PAGE_SIZE, marketKey, parseMarketParams, type MarketSort } from "@/lib/market/params";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Market",
  description: "BitCraft Online market — lowest ask, highest bid, quantity, and recent sold volume per item across all regions.",
  alternates: { canonical: "/market" },
};

type Col = { key?: MarketSort; label: string; align?: "right" };
const COLS: Col[] = [
  { label: "#" },
  { label: "Item" },
  { key: "ask", label: "Lowest ask", align: "right" },
  { key: "bid", label: "Highest bid", align: "right" },
  { key: "askQty", label: "Available", align: "right" },
  { label: "Markets", align: "right" },
  { key: "sold", label: "Sold (24h)", align: "right" },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const params = parseMarketParams(sp);
  const { rows, total } = await getMarketList(params);

  const sortHref = (key: MarketSort) => {
    const qp = new URLSearchParams();
    if (params.q) qp.set("q", params.q);
    if (params.type !== "all") qp.set("type", params.type);
    qp.set("sort", key);
    return `/market?${qp.toString()}`;
  };
  const preserved: Record<string, string | undefined> = {
    q: params.q || undefined,
    type: params.type !== "all" ? params.type : undefined,
    sort: params.sort !== "sold" ? params.sort : undefined,
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Market</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} traded items</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form method="GET" action="/market" className="flex items-center gap-2 text-sm">
          {params.sort !== "sold" && <input type="hidden" name="sort" value={params.sort} />}
          {params.type !== "all" && <input type="hidden" name="type" value={params.type} />}
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search items…"
            aria-label="Search market"
            className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">Search</button>
        </form>
        <div className="flex items-center gap-1 text-sm">
          {(["all", "item", "cargo"] as const).map((t) => {
            const qp = new URLSearchParams();
            if (params.q) qp.set("q", params.q);
            if (params.sort !== "sold") qp.set("sort", params.sort);
            if (t !== "all") qp.set("type", t);
            const active = params.type === t;
            return (
              <Link
                key={t}
                href={`/market?${qp.toString()}`}
                className={"rounded-md px-2.5 py-1.5 " + (active ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:bg-muted/40")}
              >
                {t === "all" ? "All" : t === "item" ? "Items" : "Cargo"}
              </Link>
            );
          })}
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            {COLS.map((c) => (
              <th key={c.label} className={`py-2 pr-3 ${c.align === "right" ? "text-right" : ""}`}>
                {c.key ? (
                  <Link href={sortHref(c.key)} className="hover:underline">
                    {c.label}{params.sort === c.key ? " ▲" : ""}
                  </Link>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={`${m.itemType}-${m.itemId}`} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * MARKET_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/market/${marketKey(m.itemType, m.itemId)}`} className="inline-flex items-center gap-2 hover:underline">
                  <EntityIcon assetName={m.iconAssetName} name={m.itemName} rarity={m.rarity} size={24} />
                  {m.itemName || `#${m.itemId}`}
                </Link>
              </td>
              <td className="py-2 pr-3 text-right font-mono">{m.lowestAsk?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{m.highestBid?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{m.askQty.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{m.marketplaceCount.toLocaleString()}</td>
              <td className="py-2 text-right font-mono">{m.soldQtyRecent.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">No items found.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-6">
        <Pager page={params.page} total={total} pageSize={MARKET_PAGE_SIZE} searchParams={preserved} basePath="/market" />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/market/page.tsx
git commit -m "$(cat <<'EOF'
feat(market): browse list page (search, type filter, sort, paging)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Price-history chart component

**Files:**
- Create: `apps/web/components/market/MarketPriceChart.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/market/MarketPriceChart.tsx` (pure SVG, server component, no chart dependency):

```tsx
import type { PricePoint } from "@/lib/queries/market";

/** Minimal lowest-ask / highest-bid line chart. Sparse at launch; fills in over time. */
export function MarketPriceChart({ points }: { points: PricePoint[] }) {
  const data = points.filter((p) => p.lowestAsk != null || p.highestBid != null);
  if (data.length < 2) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Not enough history yet — price history accrues from launch forward.
      </p>
    );
  }
  const W = 640, H = 200, P = 32;
  const vals = data.flatMap((p) => [p.lowestAsk, p.highestBid].filter((v): v is number => v != null));
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => P + (i / (data.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const line = (key: "lowestAsk" | "highestBid") =>
    data.map((p, i) => (p[key] == null ? null : `${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`)).filter(Boolean).join(" ");

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-muted-foreground" role="img" aria-label="Price history (lowest ask and highest bid over time)">
        <polyline fill="none" stroke="#D5BB72" strokeWidth="2" points={line("lowestAsk")} />
        <polyline fill="none" stroke="#747184" strokeWidth="2" points={line("highestBid")} />
        <text x={4} y={14} className="fill-current text-[10px]">{max.toLocaleString()}</text>
        <text x={4} y={H - 4} className="fill-current text-[10px]">{min.toLocaleString()}</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#D5BB72" }} /> Lowest ask</span>
        <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#747184" }} /> Highest bid</span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/market/MarketPriceChart.tsx
git commit -m "$(cat <<'EOF'
feat(market): minimal SVG price-history chart component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Market item detail page

**Files:**
- Create: `apps/web/app/market/[key]/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/app/market/[key]/page.tsx` (modeled on `apps/web/app/empires/[id]/page.tsx`):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { gameTimestampToMs } from "@bcc/shared";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { MarketPriceChart } from "@/components/market/MarketPriceChart";
import { parseMarketKey, marketKey } from "@/lib/market/params";
import {
  getMarketItem, getMarketOrders, getMarketLocations, getRecentSales, getMarketPriceHistory, listMarketItemKeys,
} from "@/lib/queries/market";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const keys = await listMarketItemKeys();
  return keys.map((k) => ({ key: marketKey(k.itemType, k.itemId) }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const parsed = parseMarketKey(key);
  if (!parsed) return { title: "Market" };
  const item = await getMarketItem(parsed.itemType, parsed.itemId);
  if (!item) return { title: "Market" };
  return {
    title: `${item.itemName} — Market`,
    description: `BitCraft Online market for ${item.itemName}: lowest ask, highest bid, locations, recent sales, and price history.`,
    alternates: { canonical: `/market/${key}` },
  };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

export default async function MarketItemPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const parsed = parseMarketKey(key);
  if (!parsed) notFound();
  const item = await getMarketItem(parsed.itemType, parsed.itemId);
  if (!item) notFound();

  const [orders, locations, sales, history] = await Promise.all([
    getMarketOrders(parsed.itemType, parsed.itemId),
    getMarketLocations(parsed.itemType, parsed.itemId),
    getRecentSales(parsed.itemType, parsed.itemId),
    getMarketPriceHistory(parsed.itemType, parsed.itemId),
  ]);

  const compendiumHref = `${item.itemType === 1 ? "/cargo" : "/items"}/${item.itemSlug}`;
  const spread = item.lowestAsk != null && item.highestBid != null ? item.lowestAsk - item.highestBid : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/market" className="hover:underline">Market</Link> / <span>{item.itemName}</span>
      </nav>

      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold tracking-tight">
        <EntityIcon assetName={item.iconAssetName} name={item.itemName} rarity={item.rarity} size={40} />
        {item.itemName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.itemType === 1 ? "Cargo" : "Item"}{item.tier != null ? ` · Tier ${item.tier}` : ""} · {item.rarity}
        {item.itemSlug ? <> · <Link href={compendiumHref} className="hover:underline">Compendium entry →</Link></> : null}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lowest ask" value={item.lowestAsk?.toLocaleString() ?? "—"} />
        <Stat label="Highest bid" value={item.highestBid?.toLocaleString() ?? "—"} />
        <Stat label="Spread" value={spread?.toLocaleString() ?? "—"} />
        <Stat label="Available" value={item.askQty} />
        <Stat label="Wanted" value={item.bidQty} />
        <Stat label="Markets" value={item.marketplaceCount} />
        <Stat label="Regions" value={item.regionCount} />
        <Stat label="Sold (24h)" value={item.soldQtyRecent} />
      </div>

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Asks</h2>
          {orders.asks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sell orders.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Price</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 text-right">Cumul.</th></tr></thead>
              <tbody>
                {orders.asks.map((o, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={`py-1.5 pr-3 text-right font-mono ${o.sentinel ? "text-muted-foreground" : ""}`}>{o.price.toLocaleString()}{o.sentinel ? " ⚠" : ""}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{o.quantity.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground">{o.cumulative.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold">Bids</h2>
          {orders.bids.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No buy orders.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Price</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 text-right">Cumul.</th></tr></thead>
              <tbody>
                {orders.bids.map((o, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={`py-1.5 pr-3 text-right font-mono ${o.sentinel ? "text-muted-foreground" : ""}`}>{o.price.toLocaleString()}{o.sentinel ? " ⚠" : ""}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{o.quantity.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground">{o.cumulative.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Price history</h2>
        <MarketPriceChart points={history} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Locations</h2>
        {locations.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No active listings.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3">Claim</th><th className="py-2 pr-3">Region</th><th className="py-2 pr-3 text-right">Best ask</th><th className="py-2 text-right">Available</th></tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.claimEntityId} className="border-t border-border">
                  <td className="py-1.5 pr-3">{l.claimName || l.claimEntityId}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{l.region}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{l.bestAsk?.toLocaleString() ?? "—"}</td>
                  <td className="py-1.5 text-right font-mono">{l.askQty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recent sales</h2>
        <p className="mt-1 text-xs text-muted-foreground">Sale price is not recorded by the game — volume and timing only.</p>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No recent sales.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3">Region</th><th className="py-2">When</th></tr></thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-right font-mono">{s.quantity.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{s.region}</td>
                  <td className="py-1.5 text-muted-foreground">{new Date(gameTimestampToMs(s.timestamp)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/market/[key]/page.tsx
git commit -m "$(cat <<'EOF'
feat(market): item detail page (ladders, locations, sales, history)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Navigation entry

**Files:**
- Modify: `apps/web/components/SiteHeader.tsx`

- [ ] **Step 1: Add the nav link**

In `apps/web/components/SiteHeader.tsx`, add `["/market", "Market"]` to the `NAV` array after the `/players` entry:

```ts
const NAV: [string, string][] = [
  ["/compendium", "Compendium"],
  ["/calculator", "Calculator"],
  ["/map", "Map"],
  ["/empires", "Empires"],
  ["/players", "Players"],
  ["/market", "Market"],
  ["/leaderboards", "Leaderboards"],
  ["/blog", "Blog"],
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/SiteHeader.tsx
git commit -m "$(cat <<'EOF'
feat(market): add Market to site navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Full verification

**Files:** none (verification task)

- [ ] **Step 1: Workspace typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: both PASS across all packages (map-market tests green).

- [ ] **Step 2: Web build**

Run: `pnpm --filter @bcc/web build`
Expected: build succeeds; `/market` and `/market/[key]` appear in the route output (the detail route prerenders the top traded items via `generateStaticParams`).

- [ ] **Step 3: Manual smoke check**

Run: `pnpm --filter @bcc/web dev` and visit:
- `/market` — list renders, default sort is most-traded, search + Items/Cargo filter + sortable headers work, icons show, pager works.
- click a top item → `/market/<type>-<id>` — header stats, ask/bid ladders (sentinel rows flagged ⚠), price-history note or chart, locations table (claim names from the claims join), recent-sales table with the "no price recorded" caveat, and a working Compendium-entry link.

Expected: all sections render without errors; numbers match the DB spot-check from Task 6.

- [ ] **Step 4: Confirm `main` is green**

Run: `git status`
Expected: clean working tree, all market commits present. No further commit needed.

---

## Notes for the implementer
- **Big-int ids** are strings end-to-end (`extractTableInserts` + `idStr`); never coerce order/owner/claim ids to `number`.
- **Sentinel filtering** lives in two places that must agree: the SQL aggregation (Task 5) and `PRICE_SENTINEL_CEILING` reused by the web queries (Task 7). Both import the single shared constant.
- **Item vs cargo** is carried by `itemType` (0=item, 1=cargo) through every layer; the route key encodes it as `item-`/`cargo-`.
- **No price for sales** is a hard game-data limitation — never invent or infer a sale price; the UI states this explicitly.
- If Task 6 Step 2 shows blank item names, the source column order is wrong — that is the one assumption derived from exploration rather than a committed schema; fix `column-orders.ts` and re-run, do not work around it downstream.
