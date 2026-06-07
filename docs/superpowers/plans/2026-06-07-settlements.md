# Settlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level **Settlements** section (browse list + detail with supply/treasury trend charts) that surfaces the player-claim supply economy, ingested from already-fetched per-region tables.

**Architecture:** Two new Drizzle tables — `settlements` (region-scoped clean-rebuild) and `settlement_supply_history` (append-only). A pure mapper (`map-settlements.ts`) joins four source tables the worker already pulls (`claim_state`, `claim_local_state`, `empire_settlement_state`, `claim_member_state`), filtered to real settlements via the existing `classifyClaim`. The worker writes per region in the existing transaction and appends a history slice after the loop (stamped with SQL `now()`). The web app adds queries, a list page, a reusable single-series trend chart, a detail page, and cross-links from player-detail + the map.

**Tech Stack:** TypeScript, Drizzle ORM (postgres-js), Next.js App Router (RSC), Vitest, pnpm workspaces.

**Source-of-truth references (read before starting):**
- Approved spec: `docs/superpowers/specs/2026-06-06-settlements-design.md`
- Source column orders (exact field names): `packages/shared/src/ingest/column-orders.ts` — `claim_state`, `claim_local_state`, `empire_settlement_state`, `claim_member_state`
- Patterns to mirror: `map-market.ts` (mapper), `leaderboard-snapshot.ts` (ingest), `queries/market.ts` + `market/params.ts` (web queries), `app/market/page.tsx` + `app/market/[key]/page.tsx` (pages), `components/market/MarketPriceChart.tsx` (chart).

**Conventions (apply to every commit):**
- Big-int-safe ids are **strings** (use `idStr`); never parse them as numbers.
- History is stamped with SQL `now()`, **never** a bound JS `Date` (postgres-js `ERR_INVALID_ARG_TYPE`).
- Keep `main` green: run `pnpm typecheck` and `pnpm test` before each commit.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
- `packages/shared/src/ingest/map-settlements.ts` — pure mapper `mapSettlements(...) → SettlementRow[]` + `SettlementRow` type.
- `packages/shared/src/ingest/map-settlements.test.ts` — Vitest unit tests for the mapper.
- `apps/web/lib/settlements/params.ts` — list params + sort enum + parse helper.
- `apps/web/lib/queries/settlements.ts` — server-only read queries.
- `apps/web/app/settlements/page.tsx` — browse list page.
- `apps/web/app/settlements/[id]/page.tsx` — settlement detail page.
- `apps/web/components/settlements/SettlementTrendChart.tsx` — reusable single-series SVG line chart.

**Modify:**
- `packages/shared/src/db/schema.ts` — add `settlements` + `settlementSupplyHistory` tables.
- `packages/shared/src/index.ts` — export `mapSettlements` + `SettlementRow`.
- `apps/worker/src/leaderboard-snapshot.ts` — region-loop write + post-loop history append.
- `apps/web/components/SiteHeader.tsx` — nav entry.
- `apps/web/app/players/[id]/page.tsx` — link settlement claims.
- `apps/web/components/map/WorldMap.tsx` — settlement popup "Details →" link.

---

## Task 1: Shared mapper `mapSettlements` (TDD)

**Files:**
- Create: `packages/shared/src/ingest/map-settlements.ts`
- Test: `packages/shared/src/ingest/map-settlements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/ingest/map-settlements.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapSettlements } from "./map-settlements";

const claimState = [
  // settlement (plain name)
  { entity_id: "100", owner_player_entity_id: "900", name: "Ravenmoor" },
  // landmark (coord-template name) — must be dropped
  { entity_id: "200", owner_player_entity_id: "0", name: "Ferralith Cave (N: 6836, E: 4396)" },
  // settlement with no claim_local_state — included with 0 economy
  { entity_id: "300", owner_player_entity_id: "0", name: "Far Horizon" },
];
const claimLocal = [
  {
    entity_id: "100", supplies: 1234, building_maintenance: 12.5, num_tiles: 48,
    num_tile_neighbors: 6, treasury: 5000, xp_gained_since_last_coin_minting: 777,
    supplies_purchase_threshold: 100, supplies_purchase_price: 9,
    location: [0, { x: 24594, z: 15592, dimension: 1 }],
  },
];
const settlementState = [
  { claim_entity_id: "100", empire_entity_id: "72057594000000042", can_house_empire_storehouse: true, members_donations: 333 },
];
const members = [
  { claim_entity_id: "100", player_entity_id: "900" },
  { claim_entity_id: "100", player_entity_id: "901" },
];

describe("mapSettlements", () => {
  it("keeps settlements and drops landmarks (classifyClaim)", () => {
    const rows = mapSettlements(claimState, claimLocal, settlementState, members, "7");
    expect(rows.map((r) => r.entityId).sort()).toEqual(["100", "300"]);
  });

  it("joins economy, empire link, member count, and decodes location", () => {
    const rows = mapSettlements(claimState, claimLocal, settlementState, members, "7");
    const r = rows.find((x) => x.entityId === "100")!;
    expect(r).toMatchObject({
      entityId: "100", region: "7", name: "Ravenmoor", ownerPlayerEntityId: "900",
      empireEntityId: "72057594000000042", x: 24594, z: 15592, dimension: 1,
      numTiles: 48, numTileNeighbors: 6, supplies: 1234, treasury: 5000,
      buildingMaintenance: 12.5, xpSinceMinting: 777,
      suppliesPurchaseThreshold: 100, suppliesPurchasePrice: 9,
      canHouseStorehouse: true, membersDonations: 333, memberCount: 2,
    });
  });

  it("includes a settlement with no claim_local_state, defaulting economy/location to 0", () => {
    const rows = mapSettlements(claimState, claimLocal, settlementState, members, "7");
    const r = rows.find((x) => x.entityId === "300")!;
    expect(r).toMatchObject({
      entityId: "300", name: "Far Horizon", ownerPlayerEntityId: null, empireEntityId: null,
      x: 0, z: 0, dimension: 0, numTiles: 0, supplies: 0, treasury: 0,
      buildingMaintenance: 0, canHouseStorehouse: false, membersDonations: 0, memberCount: 0,
    });
  });

  it("preserves big-int ids as strings and maps owner '0' to null", () => {
    const rows = mapSettlements(
      [{ entity_id: "72057594037927936", owner_player_entity_id: "0", name: "BigId Town" }],
      [], [], [], "7",
    );
    expect(rows[0]).toMatchObject({ entityId: "72057594037927936", ownerPlayerEntityId: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bcc/shared exec vitest run src/ingest/map-settlements.test.ts`
Expected: FAIL — `Failed to resolve import "./map-settlements"` / `mapSettlements is not a function`.

- [ ] **Step 3: Write the mapper**

Create `packages/shared/src/ingest/map-settlements.ts`:

```ts
import { toInt } from "./decode";
import { decodeLocationSum } from "../world/coords";
import { classifyClaim } from "../world/claims";

type Raw = Record<string, unknown>;
const idStr = (v: unknown): string => (v == null ? "" : String(v));
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === "true";
/** Float-preserving numeric coercion (building_maintenance is fractional). */
const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface SettlementRow {
  entityId: string;
  region: string;
  name: string;
  ownerPlayerEntityId: string | null;
  empireEntityId: string | null;
  x: number;
  z: number;
  dimension: number;
  numTiles: number;
  numTileNeighbors: number;
  supplies: number;
  suppliesPurchaseThreshold: number;
  suppliesPurchasePrice: number;
  buildingMaintenance: number;
  treasury: number;
  xpSinceMinting: number;
  canHouseStorehouse: boolean;
  membersDonations: number;
  memberCount: number;
}

/**
 * Join the per-region claim tables into settlement rows (player claims only).
 * Landmarks/ruins are dropped via classifyClaim. Settlements present in
 * claim_state but missing claim_local_state are kept with zeroed economy/location.
 */
export function mapSettlements(
  claimStateRows: Raw[],
  claimLocalRows: Raw[],
  settlementStateRows: Raw[],
  memberRows: Raw[],
  region: string,
): SettlementRow[] {
  const localByClaim = new Map<string, Raw>();
  for (const r of claimLocalRows) localByClaim.set(idStr(r.entity_id), r);

  const settlementByClaim = new Map<string, Raw>();
  for (const r of settlementStateRows) settlementByClaim.set(idStr(r.claim_entity_id), r);

  const memberCountByClaim = new Map<string, number>();
  for (const r of memberRows) {
    const cid = idStr(r.claim_entity_id);
    memberCountByClaim.set(cid, (memberCountByClaim.get(cid) ?? 0) + 1);
  }

  const out: SettlementRow[] = [];
  for (const c of claimStateRows) {
    const name = str(c.name);
    if (classifyClaim(name).kind !== "settlement") continue;
    const id = idStr(c.entity_id);
    const local = localByClaim.get(id);
    const loc = local ? decodeLocationSum(local.location) : null;
    const settlement = settlementByClaim.get(id);
    const owner = idStr(c.owner_player_entity_id);
    const empire = settlement ? idStr(settlement.empire_entity_id) : "";
    out.push({
      entityId: id,
      region,
      name,
      ownerPlayerEntityId: owner && owner !== "0" ? owner : null,
      empireEntityId: empire && empire !== "0" ? empire : null,
      x: loc?.x ?? 0,
      z: loc?.z ?? 0,
      dimension: loc?.dimension ?? 0,
      numTiles: toInt(local?.num_tiles) ?? 0,
      numTileNeighbors: toInt(local?.num_tile_neighbors) ?? 0,
      supplies: toInt(local?.supplies) ?? 0,
      suppliesPurchaseThreshold: toInt(local?.supplies_purchase_threshold) ?? 0,
      suppliesPurchasePrice: toInt(local?.supplies_purchase_price) ?? 0,
      buildingMaintenance: toNum(local?.building_maintenance),
      treasury: toInt(local?.treasury) ?? 0,
      xpSinceMinting: toInt(local?.xp_gained_since_last_coin_minting) ?? 0,
      canHouseStorehouse: settlement ? bool(settlement.can_house_empire_storehouse) : false,
      membersDonations: toInt(settlement?.members_donations) ?? 0,
      memberCount: memberCountByClaim.get(id) ?? 0,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bcc/shared exec vitest run src/ingest/map-settlements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the shared index**

In `packages/shared/src/index.ts`, after the map-market exports block (the line `export type { MarketOrderRow, MarketplaceRow, MarketSaleRow } from "./ingest/map-market";`), add:

```ts
export { mapSettlements } from "./ingest/map-settlements";
export type { SettlementRow } from "./ingest/map-settlements";
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: no errors.

```bash
git add packages/shared/src/ingest/map-settlements.ts packages/shared/src/ingest/map-settlements.test.ts packages/shared/src/index.ts
git commit -m "feat(settlements): pure mapSettlements mapper + tests"
```

---

## Task 2: Schema — `settlements` + `settlement_supply_history` tables

**Files:**
- Modify: `packages/shared/src/db/schema.ts` (append at end of file, after `marketPriceHistory`)

- [ ] **Step 1: Add the two tables**

At the end of `packages/shared/src/db/schema.ts`, append:

```ts
/** One row per player settlement (a claim). Region-scoped clean-rebuild per snapshot. */
export const settlements = pgTable(
  "settlements",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    name: text("name").notNull(),
    ownerPlayerEntityId: text("owner_player_entity_id"),
    empireEntityId: text("empire_entity_id"),
    x: integer("x").notNull().default(0),
    z: integer("z").notNull().default(0),
    dimension: integer("dimension").notNull().default(0),
    numTiles: integer("num_tiles").notNull().default(0),
    numTileNeighbors: integer("num_tile_neighbors").notNull().default(0),
    supplies: bigint("supplies", { mode: "number" }).notNull().default(0),
    suppliesPurchaseThreshold: bigint("supplies_purchase_threshold", { mode: "number" }).notNull().default(0),
    suppliesPurchasePrice: bigint("supplies_purchase_price", { mode: "number" }).notNull().default(0),
    buildingMaintenance: real("building_maintenance").notNull().default(0),
    treasury: bigint("treasury", { mode: "number" }).notNull().default(0),
    xpSinceMinting: bigint("xp_since_minting", { mode: "number" }).notNull().default(0),
    canHouseStorehouse: boolean("can_house_storehouse").notNull().default(false),
    membersDonations: bigint("members_donations", { mode: "number" }).notNull().default(0),
    memberCount: integer("member_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byRegion: index("settlements_region_idx").on(t.region),
    byTiles: index("settlements_tiles_idx").on(t.numTiles),
    bySupplies: index("settlements_supplies_idx").on(t.supplies),
    byTreasury: index("settlements_treasury_idx").on(t.treasury),
    byName: index("settlements_name_idx").on(t.name),
    byOwner: index("settlements_owner_idx").on(t.ownerPlayerEntityId),
    byEmpire: index("settlements_empire_idx").on(t.empireEntityId),
  }),
);

/** Append-only supplies/treasury trend series. One slice per settlement per snapshot. */
export const settlementSupplyHistory = pgTable(
  "settlement_supply_history",
  {
    settlementEntityId: text("settlement_entity_id").notNull(),
    snapshotAt: timestamp("snapshot_at").notNull(),
    supplies: bigint("supplies", { mode: "number" }).notNull().default(0),
    treasury: bigint("treasury", { mode: "number" }).notNull().default(0),
    buildingMaintenance: real("building_maintenance").notNull().default(0),
    numTiles: integer("num_tiles").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.settlementEntityId, t.snapshotAt] }),
    byEntity: index("settlement_history_entity_idx").on(t.settlementEntityId, t.snapshotAt),
  }),
);
```

(`pgTable`, `text`, `integer`, `bigint`, `real`, `boolean`, `timestamp`, `index`, `primaryKey` are all already imported at the top of the file.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: no errors.

- [ ] **Step 3: Generate the migration SQL**

Run: `pnpm --filter @bcc/shared db:generate`
Expected: a new file `packages/shared/drizzle/0010_<random_name>.sql` is created (highest existing is `0009_*`). Note its exact filename for the next step.

- [ ] **Step 4: Apply the migration to the database**

Run (substitute the actual generated filename from Step 3):
`pnpm --filter @bcc/shared exec node scripts/apply-sql.mjs drizzle/0010_<random_name>.sql`
Expected: `[apply-sql] applied N statements …` with no error.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle/
git commit -m "feat(settlements): add settlements + settlement_supply_history tables"
```

---

## Task 3: Worker ingest — region-loop write + post-loop history append

**Files:**
- Modify: `apps/worker/src/leaderboard-snapshot.ts`

- [ ] **Step 1: Import the mapper**

In `apps/worker/src/leaderboard-snapshot.ts`, add `mapSettlements` to the `@bcc/shared` import block (the multi-line import ending at line 12). Add it to the line that currently imports market mappers:

```ts
  mapMarketOrders, mapMarketplaces, mapClosedListings, PRICE_SENTINEL_CEILING,
  mapSettlements,
```

- [ ] **Step 2: Build the settlement rows inside the region loop**

In the per-region loop, immediately after the line that builds `marketSaleRows` (`const marketSaleRows = dedupeBy(mapClosedListings(...), (s) => s.entityId);`), add:

```ts
      const settlementRows = dedupeBy(
        mapSettlements(
          norm(r, "claim_state"),
          norm(r, "claim_local_state"),
          norm(r, "empire_settlement_state"),
          norm(r, "claim_member_state"),
          region,
        ),
        (s) => s.entityId,
      );
```

- [ ] **Step 3: Clear this region's settlements in the transaction**

Inside the `db.transaction`, in the block of `tx.delete(...)` calls, after `await tx.delete(schema.marketSales).where(eq(schema.marketSales.region, region));` add:

```ts
        await tx.delete(schema.settlements).where(eq(schema.settlements.region, region));
```

- [ ] **Step 4: Upsert the settlement rows in the transaction**

Inside the same `db.transaction`, after the `marketSaleRows` insert block (the `await inChunks(marketSaleRows, CHUNK, ...)` call), add:

```ts
        await inChunks(settlementRows, CHUNK, (s) =>
          tx.insert(schema.settlements).values(s).onConflictDoUpdate({ target: schema.settlements.entityId, set: conflictUpdateSet(schema.settlements, ["entityId"]) }),
        );
```

- [ ] **Step 5: Add settlements to the per-region console log**

In the per-region `console.log` line at the end of the loop body (the one printing `players=… orders=… sales=…`), append ` settlements=${settlementRows.length}` inside the template string.

- [ ] **Step 6: Append the history slice after the region loop**

After the market price-history block (after the `console.log(...market: ...)` line, around line 373) and before the `db.update(schema.ingestionRuns).set({ status: "ok", ... })` line, add:

```ts
    // ── Settlements: append a supplies/treasury history slice (after all regions) ──
    // Stamped with SQL now() (a bound JS Date crashes postgres-js).
    await db.execute(sql`
      INSERT INTO settlement_supply_history (settlement_entity_id, snapshot_at, supplies, treasury, building_maintenance, num_tiles)
      SELECT entity_id, now(), supplies, treasury, building_maintenance, num_tiles
      FROM settlements
      ON CONFLICT (settlement_entity_id, snapshot_at) DO NOTHING
    `);
    const settlementRes = await db.execute(sql`SELECT count(*)::int AS count FROM settlements`);
    const settlementCount = (settlementRes as unknown as { count: number }[])[0]?.count ?? 0;
    console.log(`[lb-snapshot] settlements: ${settlementCount} player settlements + supply-history slice appended`);
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: no errors. (If the worker has no `typecheck` script, run `pnpm typecheck` from the repo root.)

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/leaderboard-snapshot.ts
git commit -m "feat(settlements): worker ingest + post-loop supply-history append"
```

---

## Task 4: Web list params

**Files:**
- Create: `apps/web/lib/settlements/params.ts`

- [ ] **Step 1: Write the params module**

Create `apps/web/lib/settlements/params.ts`:

```ts
export const SETTLEMENT_PAGE_SIZE = 100;
export const SETTLEMENT_SORTS = ["tiles", "supplies", "treasury", "maintenance", "members", "name"] as const;
export type SettlementSort = (typeof SETTLEMENT_SORTS)[number];

export interface SettlementListParams {
  q: string;
  region: string;
  sort: SettlementSort;
  page: number;
}

export function parseSettlementParams(sp: Record<string, string | string[] | undefined>): SettlementListParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() ?? "";
  const region = one(sp.region)?.trim() ?? "";
  const sortRaw = one(sp.sort) as SettlementSort | undefined;
  const sort = sortRaw && (SETTLEMENT_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "tiles";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { q, region, sort, page };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/lib/settlements/params.ts
git commit -m "feat(settlements): web list params + sort enum"
```

---

## Task 5: Web read queries

**Files:**
- Create: `apps/web/lib/queries/settlements.ts`

- [ ] **Step 1: Write the queries module**

Create `apps/web/lib/queries/settlements.ts`:

```ts
import "server-only";
import { and, asc, desc, eq, ilike, sql, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { SETTLEMENT_PAGE_SIZE, type SettlementListParams } from "@/lib/settlements/params";

const { settlements, settlementSupplyHistory, claimMembers, players, empires } = schema;

export interface SettlementListRow {
  entityId: string;
  name: string;
  region: string;
  ownerPlayerEntityId: string | null;
  ownerName: string | null;
  empireEntityId: string | null;
  empireName: string | null;
  numTiles: number;
  supplies: number;
  treasury: number;
  buildingMaintenance: number;
  memberCount: number;
}

export async function getSettlementsList(params: SettlementListParams): Promise<{ rows: SettlementListRow[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(settlements.name, `%${params.q}%`));
  if (params.region) conds.push(eq(settlements.region, params.region));
  const where = conds.length ? and(...conds) : undefined;

  const orderBy =
    params.sort === "supplies" ? desc(settlements.supplies) :
    params.sort === "treasury" ? desc(settlements.treasury) :
    params.sort === "maintenance" ? desc(settlements.buildingMaintenance) :
    params.sort === "members" ? desc(settlements.memberCount) :
    params.sort === "name" ? asc(settlements.name) :
    desc(settlements.numTiles);

  const [{ total }] = await db.select({ total: count() }).from(settlements).where(where);
  const rows = await db
    .select({
      entityId: settlements.entityId,
      name: settlements.name,
      region: settlements.region,
      ownerPlayerEntityId: settlements.ownerPlayerEntityId,
      ownerName: players.username,
      empireEntityId: settlements.empireEntityId,
      empireName: empires.name,
      numTiles: settlements.numTiles,
      supplies: settlements.supplies,
      treasury: settlements.treasury,
      buildingMaintenance: settlements.buildingMaintenance,
      memberCount: settlements.memberCount,
    })
    .from(settlements)
    .leftJoin(players, eq(players.entityId, settlements.ownerPlayerEntityId))
    .leftJoin(empires, eq(empires.entityId, settlements.empireEntityId))
    .where(where)
    .orderBy(orderBy, asc(settlements.name))
    .limit(SETTLEMENT_PAGE_SIZE)
    .offset((params.page - 1) * SETTLEMENT_PAGE_SIZE);
  return { rows, total: Number(total) };
}

export type SettlementDetail = typeof settlements.$inferSelect & { ownerName: string | null; empireName: string | null };

export async function getSettlement(id: string): Promise<SettlementDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      s: settlements,
      ownerName: players.username,
      empireName: empires.name,
    })
    .from(settlements)
    .leftJoin(players, eq(players.entityId, settlements.ownerPlayerEntityId))
    .leftJoin(empires, eq(empires.entityId, settlements.empireEntityId))
    .where(eq(settlements.entityId, id))
    .limit(1);
  if (!row) return null;
  return { ...row.s, ownerName: row.ownerName, empireName: row.empireName };
}

export interface SettlementMemberRow {
  playerEntityId: string;
  username: string | null;
  coOwner: boolean;
  officer: boolean;
  build: boolean;
  inventory: boolean;
}

export async function getSettlementMembers(id: string): Promise<SettlementMemberRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      playerEntityId: claimMembers.playerEntityId,
      username: players.username,
      coOwner: claimMembers.coOwner,
      officer: claimMembers.officer,
      build: claimMembers.build,
      inventory: claimMembers.inventory,
    })
    .from(claimMembers)
    .leftJoin(players, eq(players.entityId, claimMembers.playerEntityId))
    .where(eq(claimMembers.claimEntityId, id))
    .orderBy(desc(claimMembers.coOwner), desc(claimMembers.officer));
  return rows;
}

export interface SupplyPoint {
  snapshotAt: Date;
  supplies: number;
  treasury: number;
  buildingMaintenance: number;
  numTiles: number;
}

export async function getSettlementHistory(id: string): Promise<SupplyPoint[]> {
  const db = getDb();
  return db
    .select({
      snapshotAt: settlementSupplyHistory.snapshotAt,
      supplies: settlementSupplyHistory.supplies,
      treasury: settlementSupplyHistory.treasury,
      buildingMaintenance: settlementSupplyHistory.buildingMaintenance,
      numTiles: settlementSupplyHistory.numTiles,
    })
    .from(settlementSupplyHistory)
    .where(eq(settlementSupplyHistory.settlementEntityId, id))
    .orderBy(asc(settlementSupplyHistory.snapshotAt));
}

export async function listSettlementIds(limit = 200): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: settlements.entityId })
    .from(settlements)
    .orderBy(desc(settlements.numTiles))
    .limit(limit);
  return rows.map((r) => r.id);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/lib/queries/settlements.ts
git commit -m "feat(settlements): web read queries (list, detail, members, history)"
```

---

## Task 6: Browse list page `/settlements`

**Files:**
- Create: `apps/web/app/settlements/page.tsx`

- [ ] **Step 1: Write the list page**

Create `apps/web/app/settlements/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/compendium/Pager";
import { getSettlementsList } from "@/lib/queries/settlements";
import { SETTLEMENT_PAGE_SIZE, parseSettlementParams, type SettlementSort } from "@/lib/settlements/params";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Settlements",
  description: "BitCraft Online player settlements — supplies, treasury, tiles, maintenance, and members across all regions.",
  alternates: { canonical: "/settlements" },
};

type Col = { key?: SettlementSort; label: string; align?: "right" };
const COLS: Col[] = [
  { label: "#" },
  { key: "name", label: "Settlement" },
  { label: "Region" },
  { label: "Owner" },
  { label: "Empire" },
  { key: "tiles", label: "Tiles", align: "right" },
  { key: "supplies", label: "Supplies", align: "right" },
  { key: "treasury", label: "Treasury", align: "right" },
  { key: "maintenance", label: "Maintenance", align: "right" },
  { key: "members", label: "Members", align: "right" },
];

export default async function SettlementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const params = parseSettlementParams(sp);
  const { rows, total } = await getSettlementsList(params);

  const sortHref = (key: SettlementSort) => {
    const qp = new URLSearchParams();
    if (params.q) qp.set("q", params.q);
    if (params.region) qp.set("region", params.region);
    qp.set("sort", key);
    return `/settlements?${qp.toString()}`;
  };
  const preserved: Record<string, string | undefined> = {
    q: params.q || undefined,
    region: params.region || undefined,
    sort: params.sort !== "tiles" ? params.sort : undefined,
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Settlements</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} player settlements</p>

      <form method="GET" action="/settlements" className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        {params.sort !== "tiles" && <input type="hidden" name="sort" value={params.sort} />}
        <input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="Search settlements…"
          aria-label="Search settlements"
          className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <input
          type="text"
          name="region"
          defaultValue={params.region}
          placeholder="Region"
          aria-label="Filter by region"
          className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">Search</button>
      </form>

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
          {rows.map((s, i) => (
            <tr key={s.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * SETTLEMENT_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/settlements/${s.entityId}`} className="hover:underline">{s.name || `Claim ${s.entityId}`}</Link>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{s.region}</td>
              <td className="py-2 pr-3">
                {s.ownerPlayerEntityId ? (
                  <Link href={`/players/${s.ownerPlayerEntityId}`} className="hover:underline">{s.ownerName || "—"}</Link>
                ) : "—"}
              </td>
              <td className="py-2 pr-3">
                {s.empireEntityId ? (
                  <Link href={`/empires/${s.empireEntityId}`} className="hover:underline">{s.empireName || "—"}</Link>
                ) : "—"}
              </td>
              <td className="py-2 pr-3 text-right font-mono">{s.numTiles.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{s.supplies.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{s.treasury.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{Math.round(s.buildingMaintenance).toLocaleString()}</td>
              <td className="py-2 text-right font-mono">{s.memberCount.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">No settlements found.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-6">
        <Pager page={params.page} total={total} pageSize={SETTLEMENT_PAGE_SIZE} searchParams={preserved} basePath="/settlements" />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors. (`Pager` is the same component the market list uses; its props are `page`, `total`, `pageSize`, `searchParams`, `basePath`.)

```bash
git add apps/web/app/settlements/page.tsx
git commit -m "feat(settlements): browse list page (search, region filter, sortable)"
```

---

## Task 7: Trend chart component

**Files:**
- Create: `apps/web/components/settlements/SettlementTrendChart.tsx`

- [ ] **Step 1: Write the chart**

Create `apps/web/components/settlements/SettlementTrendChart.tsx`:

```tsx
/** Minimal single-series SVG line chart. Sparse at launch; fills in over time.
 *  Rendered once per metric (supplies, treasury) since magnitudes differ. */
export function SettlementTrendChart({
  points,
  label,
  color,
}: {
  points: { snapshotAt: Date; value: number }[];
  label: string;
  color: string;
}) {
  const data = points.filter((p) => Number.isFinite(p.value));
  if (data.length < 2) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Not enough history yet — {label.toLowerCase()} history accrues from launch forward.
      </p>
    );
  }
  const W = 640, H = 200, P = 32;
  const vals = data.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => P + (i / (data.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const line = data.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-muted-foreground" role="img" aria-label={`${label} over time`}>
        <polyline fill="none" stroke={color} strokeWidth="2" points={line} />
        <text x={4} y={14} className="fill-current text-[10px]">{max.toLocaleString()}</text>
        <text x={4} y={H - 4} className="fill-current text-[10px]">{min.toLocaleString()}</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: color }} /> {label}</span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/components/settlements/SettlementTrendChart.tsx
git commit -m "feat(settlements): single-series SVG trend chart component"
```

---

## Task 8: Detail page `/settlements/[id]`

**Files:**
- Create: `apps/web/app/settlements/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

Create `apps/web/app/settlements/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettlementTrendChart } from "@/components/settlements/SettlementTrendChart";
import {
  getSettlement, getSettlementMembers, getSettlementHistory, listSettlementIds,
} from "@/lib/queries/settlements";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listSettlementIds(200);
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await getSettlement(id);
  if (!s) return { title: "Settlement" };
  return {
    title: `${s.name} — Settlement`,
    description: `BitCraft Online settlement ${s.name}: supplies, treasury, tiles, maintenance, members, and supply history.`,
    alternates: { canonical: `/settlements/${id}` },
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

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>;
}

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSettlement(id);
  if (!s) notFound();

  const [members, history] = await Promise.all([
    getSettlementMembers(id),
    getSettlementHistory(id),
  ]);

  const suppliesPoints = history.map((p) => ({ snapshotAt: p.snapshotAt, value: p.supplies }));
  const treasuryPoints = history.map((p) => ({ snapshotAt: p.snapshotAt, value: p.treasury }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/settlements" className="hover:underline">Settlements</Link> / <span>{s.name}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">{s.name || `Claim ${s.entityId}`}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Region {s.region}</span>
        {s.ownerPlayerEntityId && (
          <>· <Link href={`/players/${s.ownerPlayerEntityId}`} className="hover:underline">{s.ownerName || "owner"}</Link></>
        )}
        {s.empireEntityId && (
          <>· <Link href={`/empires/${s.empireEntityId}`} className="hover:underline">{s.empireName || "empire"}</Link></>
        )}
        {s.canHouseStorehouse && <Badge>Can house storehouse</Badge>}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tiles" value={s.numTiles} />
        <Stat label="Tile neighbors" value={s.numTileNeighbors} />
        <Stat label="Supplies" value={s.supplies} />
        <Stat label="Supplies threshold" value={s.suppliesPurchaseThreshold} />
        <Stat label="Purchase price" value={s.suppliesPurchasePrice} />
        <Stat label="Maintenance" value={Math.round(s.buildingMaintenance)} />
        <Stat label="Treasury" value={s.treasury} />
        <Stat label="XP since minting" value={s.xpSinceMinting} />
        <Stat label="Members" value={s.memberCount} />
        <Stat label="Member donations" value={s.membersDonations} />
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Supplies history</h2>
        <SettlementTrendChart points={suppliesPoints} label="Supplies" color="#D5BB72" />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Treasury history</h2>
        <SettlementTrendChart points={treasuryPoints} label="Treasury" color="#747184" />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Members</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No members.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {members.map((m) => (
              <li key={m.playerEntityId} className="flex flex-wrap items-center gap-2">
                <Link href={`/players/${m.playerEntityId}`} className="hover:underline">{m.username || `player ${m.playerEntityId}`}</Link>
                {m.coOwner && <Badge>Co-owner</Badge>}
                {m.officer && <Badge>Officer</Badge>}
                {m.build && <Badge>Build</Badge>}
                {m.inventory && <Badge>Inventory</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 text-sm text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">Location</h2>
        <p className="mt-3">
          x {s.x.toLocaleString()}, z {s.z.toLocaleString()} (dimension {s.dimension}) ·{" "}
          <Link href="/map" className="hover:underline">View on map →</Link>
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/app/settlements/[id]/page.tsx
git commit -m "feat(settlements): detail page (stats, supply/treasury charts, members)"
```

---

## Task 9: Cross-links — player detail + map popup

**Files:**
- Modify: `apps/web/app/players/[id]/page.tsx`
- Modify: `apps/web/components/map/WorldMap.tsx`

- [ ] **Step 1: Import the claim classifier in the player page**

In `apps/web/app/players/[id]/page.tsx`, add to the top imports:

```ts
import { classifyClaim } from "@bcc/shared";
```

- [ ] **Step 2: Link settlement claims in the player page claims list**

In `apps/web/app/players/[id]/page.tsx`, replace the claims `<li>` body. Change:

```tsx
          {claims.map((c) => (
            <li key={c.claimEntityId} className="flex flex-wrap items-center gap-2">
              <span>{c.claimName || `claim ${c.claimEntityId}`}</span>
```

to:

```tsx
          {claims.map((c) => {
            const isSettlement = !!c.claimName && classifyClaim(c.claimName).kind === "settlement";
            return (
            <li key={c.claimEntityId} className="flex flex-wrap items-center gap-2">
              {isSettlement ? (
                <Link href={`/settlements/${c.claimEntityId}`} className="hover:underline">{c.claimName}</Link>
              ) : (
                <span>{c.claimName || `claim ${c.claimEntityId}`}</span>
              )}
```

Then close the new arrow body: the existing block ends with

```tsx
              {c.inventory && <Badge>Inventory</Badge>}
            </li>
          ))}
```

Change the closing `))}` to `); })}` so the `map` callback returns the `<li>`:

```tsx
              {c.inventory && <Badge>Inventory</Badge>}
            </li>
            );
          })}
```

- [ ] **Step 3: Verify the player page typechecks**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

- [ ] **Step 4: Add a "Details →" link to the settlement map popup**

In `apps/web/components/map/WorldMap.tsx`, in the Settlements layer's `<Popup>` (currently shows `<strong>{c.name}</strong>` then tiles · treasury), add a details link. Change:

```tsx
                  <Popup>
                    <strong>{c.name}</strong>
                    <br />
                    {c.tiles.toLocaleString()} tiles · treasury {c.treasury.toLocaleString()}
                  </Popup>
```

to:

```tsx
                  <Popup>
                    <strong>{c.name}</strong>
                    <br />
                    {c.tiles.toLocaleString()} tiles · treasury {c.treasury.toLocaleString()}
                    <br />
                    <a href={`/settlements/${c.id}`}>Details →</a>
                  </Popup>
```

(`c.id` is the claim `entityId`, which is the settlement detail route param. A plain `<a>` is used because the popup renders into a Leaflet-managed DOM node outside React Router's tree — a full navigation is correct here.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/app/players/[id]/page.tsx apps/web/components/map/WorldMap.tsx
git commit -m "feat(settlements): cross-link from player claims + map popups"
```

---

## Task 10: Navigation entry

**Files:**
- Modify: `apps/web/components/SiteHeader.tsx`

- [ ] **Step 1: Add the nav link after Empires**

In `apps/web/components/SiteHeader.tsx`, in the `NAV` array, add `["/settlements", "Settlements"]` immediately after the `["/empires", "Empires"]` entry:

```ts
  ["/empires", "Empires"],
  ["/settlements", "Settlements"],
  ["/players", "Players"],
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/components/SiteHeader.tsx
git commit -m "feat(settlements): add Settlements to site navigation"
```

---

## Task 11: Full verification + live snapshot check

This task runs the whole test suite, a production web build, then a live ingest to confirm the economy data is real (the one assumption that needs real data — Task-6-style spot check from the market build).

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS, including the new `map-settlements.test.ts` (4 tests).

- [ ] **Step 2: Run the web production build**

Run: `pnpm --filter @bcc/web build`
Expected: build succeeds; `/settlements` and `/settlements/[id]` appear in the route output.

- [ ] **Step 3: Run a live ingest snapshot**

Run the worker once against live data (the same command used to run the snapshot in development — check `apps/worker/package.json` for the script name, e.g. `pnpm --filter @bcc/worker start` or `pnpm --filter @bcc/worker snapshot`).
Expected console line: `[lb-snapshot] settlements: <N> player settlements + supply-history slice appended` with N > 0.

- [ ] **Step 4: Spot-check the ingested data against the database**

Using the DB (psql or a one-off script), verify:
- `SELECT count(*) FROM settlements;` — non-zero, and roughly matches the worker's reported N.
- `SELECT name, num_tiles, supplies, treasury, building_maintenance, members_donations, member_count FROM settlements ORDER BY num_tiles DESC LIMIT 10;` — names look like real settlements (not landmark templates with `|~` or `(N: …, E: …)`); `supplies`/`treasury`/`num_tiles` are populated; `building_maintenance` and `members_donations` hold plausible values (confirm the numeric magnitudes/units make sense — this is the field-encoding confirmation called out in the spec).
- `SELECT count(*) FROM settlement_supply_history;` — non-zero after one run; run the ingest a second time and confirm `SELECT settlement_entity_id, count(*) FROM settlement_supply_history GROUP BY 1 ORDER BY 2 DESC LIMIT 5;` shows ≥ 2 slices per settlement.

If any economy field looks wrong (e.g. `building_maintenance` is always 0, or a value is off by a known encoding like a tagged-enum array or a Timestamp object), fix the mapping in `map-settlements.ts`, add/adjust a unit test, and re-run Steps 1 + 3 + 4.

- [ ] **Step 5: Visually confirm the pages**

Start the web dev server and confirm:
- `/settlements` lists settlements, default-sorted by tiles desc; search + region filter + sortable headers work; pager works.
- A settlement detail page renders the stat grid + members; the two trend charts show the "history accrues from launch forward" note until ≥ 2 snapshots exist.
- Nav shows Settlements after Empires; a player-detail settlement claim links to `/settlements/[id]`; a map settlement popup shows "Details →".

- [ ] **Step 6: Final commit (only if Step 4 required mapper fixes)**

```bash
git add packages/shared/src/ingest/map-settlements.ts packages/shared/src/ingest/map-settlements.test.ts
git commit -m "fix(settlements): correct economy field mapping per live snapshot"
```

---

## Spec coverage check

- Two new tables (`settlements`, `settlement_supply_history`), member roster reuses `claimMembers` → Task 2, schema. ✓ (history stamped with SQL `now()` → Task 3, Step 6.)
- No new source queries; mapper joins the four already-fetched tables → Task 1 + Task 3. ✓
- `classifyClaim` filter (player settlements only) → Task 1 mapper + test. ✓
- Region-loop clean rebuild + post-loop history append → Task 3. ✓
- Web queries (list, detail, members, history, ids) → Task 5. ✓
- `/settlements` list (default sort tiles, search, region filter, sortable, pager) → Task 6. ✓
- Trend chart (single series, rendered twice) → Task 7 + Task 8. ✓
- `/settlements/[id]` detail (stat grid, two charts, members, location/map link, generateStaticParams/Metadata/revalidate/dynamicParams) → Task 8. ✓
- Cross-links (player detail, map popup) → Task 9. ✓
- Nav after Empires → Task 10. ✓
- Unit tests + live verify + build → Task 1 + Task 11. ✓
- Out-of-scope items (per-building inventory, claim tech, "days remaining" countdown, empire→settlements list) are intentionally NOT included. ✓
```