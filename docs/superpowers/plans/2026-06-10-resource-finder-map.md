# Resource & Creature Finder (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players can search/browse any of 513 resources and 41 creatures, see every spawn point on the world map (color-coded, multi-tracked, shareable URLs), browse `/resources` + `/creatures` compendium pages with embedded maps, and toggle an in-game roads overlay.

**Architecture:** A manual worker job (`resource-snapshot`) pulls catalogs into Postgres and exports spawn positions as static files: per-resource-per-region JSON to a separate public GitHub data repo (served via jsDelivr CDN — ~400 MB total, too big for the app repo / Neon), small per-region enemy JSON + pre-rendered road PNGs into the app repo's `public/`. The map client lazy-fetches position files only when a resource is tracked and draws them on a single custom canvas layer (no DOM markers).

**Tech Stack:** Existing stack only — Next.js 16 App Router, react-leaflet/Leaflet 1.9 (CRS.Simple, chunk coords), Drizzle + Neon Postgres, worker `readSnapshot()` over SpacetimeDB WS, Vitest, pngjs (one new dev-only dep for road PNGs).

---

## Spike facts (verified live 2026-06-10 against `bitcraft-live-7` — do not re-derive)

- `resource_desc` (513 rows, 342 KiB): `{id, name, description, max_health, tier, tag, rarity:[variantIdx,{}], compendium_entry, icon_asset_name, on_destroy_yield:[[itemId,qty,…],…], scheduled_respawn_time, not_respawning, …}`. `tag` is the category ("Tree", "Ore Vein", "Flower", …). Names have trailing-space dupes ("Ancient Door ", "Ancient Door   ") — trim before slugging.
- `enemy_desc` (41 rows): `{enemy_type, name, description, max_health, min_damage, max_damage, armor, accuracy, evasion, attack_level, defense_level, health_regen_quantity, daytime_detect_range, daytime_aggro_range, nighttime_detect_range, nighttime_aggro_range, icon_address, extracted_item_stacks, tier, tag, rarity:[i,{}], huntable}`.
- `resource_state` (4,069,939 rows in r7, 212 distinct resource_ids, 288 MiB JSON): `{entity_id:"5044…" (string, >2^53 — NEVER Number()), resource_id, direction_index}`.
- **Positions:** `location_state` `{entity_id, chunk_index, x, z, dimension}` — x/z are **small-hex** ints (0–23040, world-global); the map plots **chunk coords** = small-hex ÷ 96 (`smallHexToChunk` in `packages/shared/src/world/coords.ts`). Filter `dimension === 1` (others are interiors).
- **Server-side join WORKS** (507 ms, 2,993 rows for Ancient Oak): `SELECT location_state.* FROM location_state JOIN resource_state ON location_state.entity_id = resource_state.entity_id WHERE resource_state.resource_id = 23`. CAVEAT: rows from multiple join queries in one `SubscribeMulti` all arrive under `location_state` and CANNOT be attributed per query — so either one query per connection or full-table pulls joined in worker memory (we use the latter for resources).
- `enemy_state` (12,757 rows r7): `enemy_type` is a tagged enum `[variantIdx,{}]` whose **variant index == `enemy_desc.enemy_type`** (verified: variant [18] = AlphaJakyl = enemy_type 18). Positions via join: `SELECT mobile_entity_state.* FROM mobile_entity_state JOIN enemy_state ON mobile_entity_state.entity_id = enemy_state.entity_id` (12,757 rows, 3 MiB). `mobile_entity_state.location_x/z` are **milli-small-hex** (÷1000 → small-hex), filter `dimension === 1`.
- `paved_tile_state` (501,232 rows r7): positions via `SELECT location_state.* FROM location_state JOIN paved_tile_state ON location_state.entity_id = paved_tile_state.entity_id` (~44 MiB).
- `resource_count` is **private** — do not query it.
- Rarity variant names: 0=Default, 1=Common, 2=Uncommon, 3=Rare, 4=Epic, 5=Legendary, 6=Mythic (same scheme the items pipeline stores as strings).
- Active region modules: `bitcraft-live-{7,8,9,12,13,14,17,18,19}`. `ws-snapshot.ts` already has 1 GiB maxPayload and fast-fails on SubscriptionError (committed in 4e37fa8). `apps/worker/src/resource-spike.ts` shows working query patterns.

## Data formats (single source of truth)

- Resource positions (data repo): `resources/r{region}/{resourceId}.json` → `{"v":1,"id":23,"region":7,"count":2993,"xz":[x0,z0,x1,z1,…]}` (small-hex ints, flat pairs).
- Resource index (data repo): `resources/index.json` → `{"v":1,"regions":[7,…],"counts":{"23":{"7":2993,…},…}}`.
- Enemies (app repo): `apps/web/public/map/enemies/r{region}.json` → `{"v":1,"region":7,"types":{"18":[x0,z0,…],…}}` (small-hex ints).
- Roads (app repo): `apps/web/public/map/roads/r{region}.png` + `apps/web/public/map/roads/roads.json` → `[{"region":7,"url":"/map/roads/r7.png","minX":<chunk>,"minZ":…,"maxX":…,"maxZ":…}]` (chunk coords, same convention as `public/map/terrain.json` consumed by `app/map/page.tsx:loadTerrain`).
- Web env: `NEXT_PUBLIC_MAP_DATA_BASE` — base URL for the data repo files. Local dev default `"/map-data"` (files generated into `apps/web/public/map-data/`, gitignored). Production (Netlify env var): `https://cdn.jsdelivr.net/gh/<OWNER>/bitcraftcompanion-map-data@main`.

## File structure

| File | Responsibility |
|---|---|
| `packages/shared/src/world/resources.ts` (+`.test.ts`) | Pure mappers: desc rows → catalog rows; position packing; slug/dedupe; rarity decode |
| `packages/shared/src/db/schema.ts` | Add `resources`, `creatures` tables |
| `packages/shared/src/index.ts` | Export new mappers/types |
| `apps/worker/src/resource-snapshot.ts` | Manual job: catalogs → Postgres; positions/enemies/roads → files |
| `apps/worker/src/roads-png.ts` (+`.test.ts`) | Rasterize road points → RGBA buffer (pure) + PNG write |
| `.github/workflows/resource-snapshot.yml` | Manual dispatch: run job, push data repo + commit public assets |
| `apps/web/lib/queries/resources.ts`, `creatures.ts` | Drizzle queries (list/detail/catalog-for-map) |
| `apps/web/app/resources/page.tsx`, `[slug]/page.tsx` | Compendium list + detail (embeds map) |
| `apps/web/app/creatures/page.tsx`, `[slug]/page.tsx` | Same for creatures |
| `apps/web/lib/map/tracking.ts` (+`.test.ts`) | Pure: URL param parse/serialize, decimation, track colors |
| `apps/web/components/map/ResourcePointsLayer.tsx` | Canvas overlay drawing tracked points |
| `apps/web/components/map/MapFinderPanel.tsx` | Search box + category browse + tracking chips |
| `apps/web/components/map/WorldMap.tsx` | Wire new layers/panel/URL state + roads & creatures toggles |
| `apps/web/components/map/MapClient.tsx`, `app/map/page.tsx` | Pass catalogs, searchParams, roads manifest |

Conventions for ALL tasks: run commands from repo root; TDD (write the test, see it fail, implement, see it pass); commit after each task with the message given. `pnpm --filter @bcc/shared test` runs shared Vitest; `pnpm --filter @bcc/web typecheck` checks the app. Mirror neighboring code style (no semicolon-style changes, match import ordering of the file you edit).

---

### Task 1: Shared mappers + position packing (pure, TDD)

**Files:**
- Create: `packages/shared/src/world/resources.ts`, `packages/shared/src/world/resources.test.ts`
- Modify: `packages/shared/src/index.ts` (add exports)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/world/resources.test.ts
import { describe, it, expect } from "vitest";
import {
  RARITY_NAMES, decodeRarity, slugifyName, dedupeSlugs,
  mapResourceDescRow, mapEnemyDescRow, packPositions, packMobilePositions,
} from "./resources";

describe("decodeRarity", () => {
  it("maps tagged-enum variant index to name", () => {
    expect(decodeRarity([1, {}])).toBe("Common");
    expect(decodeRarity([6, {}])).toBe("Mythic");
    expect(decodeRarity(undefined)).toBe("Default");
  });
});

describe("slug pipeline", () => {
  it("slugifies trimmed names", () => {
    expect(slugifyName("Ancient Oak Tree")).toBe("ancient-oak-tree");
    expect(slugifyName("Ancient Door   ")).toBe("ancient-door");
  });
  it("dedupes collisions with -2/-3 suffixes in input order", () => {
    expect(dedupeSlugs(["ancient-door", "ancient-door", "ancient-door"]))
      .toEqual(["ancient-door", "ancient-door-2", "ancient-door-3"]);
  });
});

describe("mapResourceDescRow", () => {
  it("maps a live-shaped row to a catalog row", () => {
    const row = {
      id: 23, name: "Ancient Oak Tree ", description: "d", max_health: 8000,
      tier: 6, tag: "Tree", rarity: [1, {}], compendium_entry: true,
      icon_asset_name: "GeneratedIcons/Other/AncientOak",
      on_destroy_yield: [[6110011, 2, [0, []], [0, 0]]],
      scheduled_respawn_time: 10800, not_respawning: false,
    };
    const out = mapResourceDescRow(row);
    expect(out).toMatchObject({
      id: 23, name: "Ancient Oak Tree", category: "Tree", tier: 6,
      rarity: "Common", maxHealth: 8000, respawnSeconds: 10800,
      notRespawning: false, compendiumEntry: true,
      yields: [{ itemId: 6110011, qty: 2 }],
    });
    expect(out.raw).toBe(row);
  });
});

describe("mapEnemyDescRow", () => {
  it("maps combat stats and loot", () => {
    const row = {
      enemy_type: 18, name: "Alpha Jakyl", description: "d", max_health: 280,
      min_damage: 15, max_damage: 27, armor: 700, accuracy: 325, evasion: 168,
      attack_level: 5, defense_level: 5, health_regen_quantity: 5,
      daytime_detect_range: 30, daytime_aggro_range: 15,
      nighttime_detect_range: 40, nighttime_aggro_range: 20,
      icon_address: "icons/jakyl", extracted_item_stacks: [[101, 1]],
      tier: 1, tag: "Monster", rarity: [1, {}], huntable: false,
    };
    expect(mapEnemyDescRow(row)).toMatchObject({
      enemyType: 18, name: "Alpha Jakyl", tier: 1, rarity: "Common",
      maxHealth: 280, minDamage: 15, maxDamage: 27, armor: 700,
      huntable: false, lootStacks: [[101, 1]],
    });
  });
});

describe("packPositions", () => {
  it("packs overworld rows to flat small-hex pairs, skipping other dimensions", () => {
    const rows = [
      { x: 9559, z: 12231, dimension: 1 },
      { x: 5, z: 6, dimension: 99 }, // interior — dropped
      { x: 100, z: 200, dimension: 1 },
    ];
    expect(packPositions(rows)).toEqual([9559, 12231, 100, 200]);
  });
});

describe("packMobilePositions", () => {
  it("converts milli-small-hex and groups by enemy type", () => {
    const enemyTypeByEntity = new Map([["e1", 18], ["e2", 18], ["e3", 2]]);
    const rows = [
      { entity_id: "e1", location_x: 10269000, location_z: 12504001, dimension: 1 },
      { entity_id: "e2", location_x: 1000, location_z: 2000, dimension: 5 }, // dropped
      { entity_id: "e3", location_x: 96000, location_z: 192000, dimension: 1 },
    ];
    expect(packMobilePositions(rows, enemyTypeByEntity)).toEqual({
      "18": [10269, 12504],
      "2": [96, 192],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bcc/shared test -- resources`
Expected: FAIL — module `./resources` not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/world/resources.ts
// Mappers for the resource/creature finder (Phase A). Live row shapes verified
// 2026-06-10 against bitcraft-live-7 — see docs/superpowers/plans/2026-06-10-resource-finder-map.md.

export const RARITY_NAMES = ["Default", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"] as const;

/** Tagged enums arrive as [variantIndex, {}] over the v1.json subprotocol. */
export function decodeRarity(v: unknown): string {
  if (Array.isArray(v) && typeof v[0] === "number") return RARITY_NAMES[v[0]] ?? "Default";
  return "Default";
}

export function slugifyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Suffix repeated slugs -2, -3, … preserving input order (live data has trailing-space dupes). */
export function dedupeSlugs(slugs: string[]): string[] {
  const seen = new Map<string, number>();
  return slugs.map((s) => {
    const n = (seen.get(s) ?? 0) + 1;
    seen.set(s, n);
    return n === 1 ? s : `${s}-${n}`;
  });
}

export interface ResourceCatalogRow {
  id: number; name: string; description: string; category: string | null;
  tier: number | null; rarity: string; maxHealth: number | null;
  respawnSeconds: number | null; notRespawning: boolean; compendiumEntry: boolean;
  iconAssetName: string | null; yields: Array<{ itemId: number; qty: number }>;
  raw: unknown;
}

export function mapResourceDescRow(r: Record<string, unknown>): ResourceCatalogRow {
  const yields = Array.isArray(r.on_destroy_yield)
    ? (r.on_destroy_yield as unknown[][])
        .filter((s) => Array.isArray(s) && typeof s[0] === "number")
        .map((s) => ({ itemId: s[0] as number, qty: (s[1] as number) ?? 1 }))
    : [];
  return {
    id: r.id as number,
    name: String(r.name ?? "").trim(),
    description: String(r.description ?? ""),
    category: (r.tag as string) || null,
    tier: (r.tier as number) ?? null,
    rarity: decodeRarity(r.rarity),
    maxHealth: (r.max_health as number) ?? null,
    respawnSeconds: (r.scheduled_respawn_time as number) || null,
    notRespawning: Boolean(r.not_respawning),
    compendiumEntry: Boolean(r.compendium_entry),
    iconAssetName: (r.icon_asset_name as string) || null,
    yields,
    raw: r,
  };
}

export interface CreatureCatalogRow {
  enemyType: number; name: string; description: string; tier: number | null;
  rarity: string; huntable: boolean; maxHealth: number | null;
  minDamage: number | null; maxDamage: number | null; armor: number | null;
  accuracy: number | null; evasion: number | null;
  attackLevel: number | null; defenseLevel: number | null; healthRegen: number | null;
  dayDetectRange: number | null; dayAggroRange: number | null;
  nightDetectRange: number | null; nightAggroRange: number | null;
  iconAssetName: string | null; lootStacks: unknown; raw: unknown;
}

export function mapEnemyDescRow(r: Record<string, unknown>): CreatureCatalogRow {
  return {
    enemyType: r.enemy_type as number,
    name: String(r.name ?? "").trim(),
    description: String(r.description ?? ""),
    tier: (r.tier as number) ?? null,
    rarity: decodeRarity(r.rarity),
    huntable: Boolean(r.huntable),
    maxHealth: (r.max_health as number) ?? null,
    minDamage: (r.min_damage as number) ?? null,
    maxDamage: (r.max_damage as number) ?? null,
    armor: (r.armor as number) ?? null,
    accuracy: (r.accuracy as number) ?? null,
    evasion: (r.evasion as number) ?? null,
    attackLevel: (r.attack_level as number) ?? null,
    defenseLevel: (r.defense_level as number) ?? null,
    healthRegen: (r.health_regen_quantity as number) ?? null,
    dayDetectRange: (r.daytime_detect_range as number) ?? null,
    dayAggroRange: (r.daytime_aggro_range as number) ?? null,
    nightDetectRange: (r.nighttime_detect_range as number) ?? null,
    nightAggroRange: (r.nighttime_aggro_range as number) ?? null,
    iconAssetName: (r.icon_address as string) || null,
    lootStacks: r.extracted_item_stacks ?? [],
    raw: r,
  };
}

/** location_state rows → flat [x,z,…] small-hex ints; overworld (dimension 1) only. */
export function packPositions(rows: Array<{ x: number; z: number; dimension: number }>): number[] {
  const out: number[] = [];
  for (const r of rows) {
    if (r.dimension !== 1) continue;
    out.push(r.x, r.z);
  }
  return out;
}

/** mobile_entity_state rows → { enemyType: [x,z,…] } small-hex ints (location_x/z are milli). */
export function packMobilePositions(
  rows: Array<{ entity_id: string | number; location_x: number; location_z: number; dimension: number }>,
  enemyTypeByEntity: Map<string, number>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    if (r.dimension !== 1) continue;
    const t = enemyTypeByEntity.get(String(r.entity_id));
    if (t === undefined) continue;
    (out[String(t)] ??= []).push(Math.round(r.location_x / 1000), Math.round(r.location_z / 1000));
  }
  return out;
}
```

- [ ] **Step 4: Export from the shared index** — open `packages/shared/src/index.ts`, find the block exporting from `./world/coords`, and add alongside it:

```ts
export {
  RARITY_NAMES, decodeRarity, slugifyName, dedupeSlugs,
  mapResourceDescRow, mapEnemyDescRow, packPositions, packMobilePositions,
  type ResourceCatalogRow, type CreatureCatalogRow,
} from "./world/resources";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @bcc/shared test -- resources`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/world/resources.ts packages/shared/src/world/resources.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): resource/creature mappers + position packing"
```

### Task 2: DB schema — `resources` + `creatures` tables

**Files:**
- Modify: `packages/shared/src/db/schema.ts` (append after the `buildings` table)

- [ ] **Step 1: Add the tables** (follow the `items` table idiom exactly — integer game-id PK, unique slug, `raw` jsonb):

```ts
/** Gatherable/world resource catalog (resource_desc). Spawn positions live in static files, not the DB. */
export const resources = pgTable(
  "resources",
  {
    id: integer("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    category: text("category"),
    tier: integer("tier"),
    rarity: text("rarity").notNull().default("Default"),
    maxHealth: integer("max_health"),
    respawnSeconds: real("respawn_seconds"),
    notRespawning: boolean("not_respawning").default(false).notNull(),
    compendiumEntry: boolean("compendium_entry").default(true).notNull(),
    iconAssetName: text("icon_asset_name"),
    yields: jsonb("yields").default([]).notNull(), // [{itemId, qty}]
    spawnCounts: jsonb("spawn_counts").default({}).notNull(), // {"7": 2993, …} region → live count
    raw: jsonb("raw").notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("resources_slug_idx").on(t.slug),
    categoryIdx: index("resources_category_idx").on(t.category),
    tierIdx: index("resources_tier_idx").on(t.tier),
  }),
);

/** Creature/enemy catalog (enemy_desc). enemy_type is the game's stable id. */
export const creatures = pgTable(
  "creatures",
  {
    enemyType: integer("enemy_type").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    tier: integer("tier"),
    rarity: text("rarity").notNull().default("Default"),
    huntable: boolean("huntable").default(false).notNull(),
    maxHealth: integer("max_health"),
    minDamage: integer("min_damage"),
    maxDamage: integer("max_damage"),
    armor: integer("armor"),
    accuracy: integer("accuracy"),
    evasion: integer("evasion"),
    attackLevel: integer("attack_level"),
    defenseLevel: integer("defense_level"),
    healthRegen: real("health_regen"),
    dayDetectRange: integer("day_detect_range"),
    dayAggroRange: integer("day_aggro_range"),
    nightDetectRange: integer("night_detect_range"),
    nightAggroRange: integer("night_aggro_range"),
    iconAssetName: text("icon_asset_name"),
    lootStacks: jsonb("loot_stacks").default([]).notNull(),
    spawnCounts: jsonb("spawn_counts").default({}).notNull(),
    raw: jsonb("raw").notNull(),
  },
  (t) => ({ slugIdx: uniqueIndex("creatures_slug_idx").on(t.slug) }),
);
```

- [ ] **Step 2: Push the schema**

Run: `pnpm --filter @bcc/shared db:push`
Expected: drizzle-kit reports the two new tables created, no other diffs. (If it proposes ANY change to existing tables, STOP and reconcile first.)

- [ ] **Step 3: Typecheck** — `pnpm --filter @bcc/shared typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/db/schema.ts
git commit -m "feat(db): resources + creatures catalog tables"
```

### Task 3: Worker — catalogs → Postgres

**Files:**
- Create: `apps/worker/src/resource-snapshot.ts`
- Modify: `apps/worker/package.json` (add script)

- [ ] **Step 1: Create the job skeleton with the catalog stage.** Model the env/db/audit framing on `leaderboard-snapshot.ts:1-17,94-103`. Region list: env `RESOURCE_REGIONS` (comma-sep ints) defaulting to `7,8,9,12,13,14,17,18,19`.

```ts
// apps/worker/src/resource-snapshot.ts
// Manual job (not the 30-min loop): resource/creature catalogs -> Postgres,
// spawn positions -> static files (see plan doc for formats & sizes).
// Run: pnpm --filter @bcc/worker resource-snapshot [catalog|positions|enemies|roads|all]
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import {
  parseServerEnv, createDb, schema,
  mapResourceDescRow, mapEnemyDescRow, slugifyName, dedupeSlugs,
  packPositions, packMobilePositions,
} from "@bcc/shared";
import { sql } from "drizzle-orm";
import { readSnapshot } from "./spacetime/ws-snapshot";
import { renderRoadsPng } from "./roads-png";

const REGIONS = (process.env.RESOURCE_REGIONS ?? "7,8,9,12,13,14,17,18,19")
  .split(",").map((s) => Number(s.trim())).filter(Number.isFinite);

const OUT_DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../out/map-data"); // -> data repo
const OUT_PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/public/map"); // app repo

const env = parseServerEnv();
const conn = { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN };
const regionModule = (r: number) => `bitcraft-live-${r}`;

async function pullCatalogs() {
  // Descs are identical across region modules; pull from the first.
  const t = await readSnapshot(
    { ...conn, moduleName: regionModule(REGIONS[0]!) },
    ["SELECT * FROM resource_desc", "SELECT * FROM enemy_desc"],
    ["resource_desc", "enemy_desc"],
    120_000,
  );
  const resources = (t.get("resource_desc") ?? []).map((r) => mapResourceDescRow(r as Record<string, unknown>));
  const creatures = (t.get("enemy_desc") ?? []).map((r) => mapEnemyDescRow(r as Record<string, unknown>));
  return { resources, creatures };
}

async function upsertCatalogs(
  db: ReturnType<typeof createDb>,
  resources: Awaited<ReturnType<typeof pullCatalogs>>["resources"],
  creatures: Awaited<ReturnType<typeof pullCatalogs>>["creatures"],
  resourceCounts: Map<number, Record<string, number>>,
  creatureCounts: Map<number, Record<string, number>>,
) {
  const rSlugs = dedupeSlugs(resources.map((r) => slugifyName(r.name)));
  const rRows = resources.map((r, i) => ({ ...r, slug: rSlugs[i]!, spawnCounts: resourceCounts.get(r.id) ?? {} }));
  const cSlugs = dedupeSlugs(creatures.map((c) => slugifyName(c.name)));
  const cRows = creatures.map((c, i) => ({ ...c, slug: cSlugs[i]!, spawnCounts: creatureCounts.get(c.enemyType) ?? {} }));
  await db.transaction(async (tx) => {
    for (let i = 0; i < rRows.length; i += 200) {
      await tx.insert(schema.resources).values(rRows.slice(i, i + 200))
        .onConflictDoUpdate({ target: schema.resources.id, set: {
          slug: sql.raw('excluded."slug"'), name: sql.raw('excluded."name"'), description: sql.raw('excluded."description"'),
          category: sql.raw('excluded."category"'), tier: sql.raw('excluded."tier"'), rarity: sql.raw('excluded."rarity"'),
          maxHealth: sql.raw('excluded."max_health"'), respawnSeconds: sql.raw('excluded."respawn_seconds"'),
          notRespawning: sql.raw('excluded."not_respawning"'), compendiumEntry: sql.raw('excluded."compendium_entry"'),
          iconAssetName: sql.raw('excluded."icon_asset_name"'), yields: sql.raw('excluded."yields"'),
          spawnCounts: sql.raw('excluded."spawn_counts"'), raw: sql.raw('excluded."raw"'),
        }});
    }
    for (let i = 0; i < cRows.length; i += 200) {
      await tx.insert(schema.creatures).values(cRows.slice(i, i + 200))
        .onConflictDoUpdate({ target: schema.creatures.enemyType, set: {
          slug: sql.raw('excluded."slug"'), name: sql.raw('excluded."name"'), description: sql.raw('excluded."description"'),
          tier: sql.raw('excluded."tier"'), rarity: sql.raw('excluded."rarity"'), huntable: sql.raw('excluded."huntable"'),
          maxHealth: sql.raw('excluded."max_health"'), minDamage: sql.raw('excluded."min_damage"'), maxDamage: sql.raw('excluded."max_damage"'),
          armor: sql.raw('excluded."armor"'), accuracy: sql.raw('excluded."accuracy"'), evasion: sql.raw('excluded."evasion"'),
          attackLevel: sql.raw('excluded."attack_level"'), defenseLevel: sql.raw('excluded."defense_level"'),
          healthRegen: sql.raw('excluded."health_regen"'), dayDetectRange: sql.raw('excluded."day_detect_range"'),
          dayAggroRange: sql.raw('excluded."day_aggro_range"'), nightDetectRange: sql.raw('excluded."night_detect_range"'),
          nightAggroRange: sql.raw('excluded."night_aggro_range"'), iconAssetName: sql.raw('excluded."icon_asset_name"'),
          lootStacks: sql.raw('excluded."loot_stacks"'), spawnCounts: sql.raw('excluded."spawn_counts"'), raw: sql.raw('excluded."raw"'),
        }});
    }
  });
  console.log(`[resource-snapshot] upserted ${rRows.length} resources, ${cRows.length} creatures`);
}
```

(Positions/enemies/roads stages + `main()` come in Tasks 4–5; for now `main()` just runs `pullCatalogs` → `upsertCatalogs` with empty count maps when stage is `catalog`.)

```ts
async function main() {
  const stage = process.argv[2] ?? "all";
  const db = createDb(env.DATABASE_URL);
  const { resources, creatures } = await pullCatalogs();
  if (stage === "catalog") {
    await upsertCatalogs(db, resources, creatures, new Map(), new Map());
  }
  process.exit(0);
}
main().catch((e) => { console.error("[resource-snapshot] FAILED:", e); process.exit(1); });
```

- [ ] **Step 2: Add the package script** in `apps/worker/package.json` next to `terrain-snapshot`:

```json
"resource-snapshot": "node --max-old-space-size=6144 --import tsx src/resource-snapshot.ts",
```

- [ ] **Step 3: Run the catalog stage for real**

Run: `pnpm --filter @bcc/worker resource-snapshot catalog`
Expected: `upserted 513 resources, 41 creatures`. Verify in DB: `SELECT count(*), count(DISTINCT slug) FROM resources;` → both 513 (slug dedupe worked).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @bcc/worker typecheck
git add apps/worker/src/resource-snapshot.ts apps/worker/package.json
git commit -m "feat(worker): resource-snapshot catalog stage (513 resources, 41 creatures)"
```

### Task 4: Worker — resource position export

**Files:**
- Modify: `apps/worker/src/resource-snapshot.ts`

**Strategy (memory-bound, per spike):** per region, TWO sequential single-query connections — (1) `SELECT * FROM resource_state` (4.07M rows / 288 MiB on r7, ~10 s), (2) the location join for ALL resources (`SELECT location_state.* FROM location_state JOIN resource_state ON location_state.entity_id = resource_state.entity_id`, ~360 MiB). Build `Map<string entityId, number resourceId>` from (1), then bucket (2)'s rows per resource id. Process ONE region fully, write its files, drop references, continue. 6 GiB heap is set on the script. Fallback if a region OOMs: per-resource-id join queries (one connection each) for only the ids seen in that region's `resource_state` — slower but bounded.

- [ ] **Step 1: Add the positions stage**

```ts
async function exportResourcePositions(): Promise<Map<number, Record<string, number>>> {
  const counts = new Map<number, Record<string, number>>();
  for (const region of REGIONS) {
    const mod = regionModule(region);
    console.log(`[resource-snapshot] region ${region}: pulling resource_state…`);
    const t1 = await readSnapshot({ ...conn, moduleName: mod }, ["SELECT * FROM resource_state"], ["resource_state"], 300_000);
    const idByEntity = new Map<string, number>();
    for (const r of (t1.get("resource_state") ?? []) as Array<{ entity_id: unknown; resource_id: number }>) {
      idByEntity.set(String(r.entity_id), r.resource_id);
    }
    t1.clear();
    console.log(`[resource-snapshot] region ${region}: ${idByEntity.size} instances; pulling locations…`);
    const t2 = await readSnapshot(
      { ...conn, moduleName: mod },
      ["SELECT location_state.* FROM location_state JOIN resource_state ON location_state.entity_id = resource_state.entity_id"],
      ["location_state"], 300_000,
    );
    const buckets = new Map<number, Array<{ x: number; z: number; dimension: number }>>();
    for (const l of (t2.get("location_state") ?? []) as Array<{ entity_id: unknown; x: number; z: number; dimension: number }>) {
      const rid = idByEntity.get(String(l.entity_id));
      if (rid === undefined) continue;
      let b = buckets.get(rid);
      if (!b) buckets.set(rid, (b = []));
      b.push(l);
    }
    t2.clear(); idByEntity.clear();
    const dir = join(OUT_DATA, "resources", `r${region}`);
    await mkdir(dir, { recursive: true });
    for (const [rid, rows] of buckets) {
      const xz = packPositions(rows);
      if (xz.length === 0) continue;
      const count = xz.length / 2;
      await writeFile(join(dir, `${rid}.json`), JSON.stringify({ v: 1, id: rid, region, count, xz }));
      (counts.get(rid) ?? counts.set(rid, {}).get(rid)!)[String(region)] = count;
    }
    console.log(`[resource-snapshot] region ${region}: wrote ${buckets.size} resource files`);
  }
  const countsObj: Record<string, Record<string, number>> = {};
  for (const [rid, byRegion] of counts) countsObj[String(rid)] = byRegion;
  await mkdir(join(OUT_DATA, "resources"), { recursive: true });
  await writeFile(join(OUT_DATA, "resources", "index.json"), JSON.stringify({ v: 1, regions: REGIONS, counts: countsObj }));
  return counts;
}
```

- [ ] **Step 2: Wire into `main()`** — `positions` stage runs `exportResourcePositions()` only; `all` runs catalogs → positions → enemies → roads → `upsertCatalogs` with the real count maps (enemies stage in Task 5 returns `creatureCounts`).

- [ ] **Step 3: Run for ONE region first** (keep the feedback loop tight):

Run: `$env:RESOURCE_REGIONS='7'; pnpm --filter @bcc/worker resource-snapshot positions`
Expected: "region 7: 4,0xx,xxx instances", ~212 files in `apps/worker/out/map-data/resources/r7/`, an `index.json`, no OOM. Spot-check: open `r7/23.json` → count ≈ 2993, xz values within 0–23040.

- [ ] **Step 4: Run all 9 regions** — `Remove-Item env:RESOURCE_REGIONS; pnpm --filter @bcc/worker resource-snapshot positions`. Expected: 9 region dirs; note total size (`du`-style: `Get-ChildItem apps/worker/out/map-data -Recurse | Measure-Object Length -Sum`) — anticipate ~300–500 MB.

- [ ] **Step 5: Gitignore the worker output + dev web copy** — add to root `.gitignore`:

```
apps/worker/out/
apps/web/public/map-data/
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/resource-snapshot.ts .gitignore
git commit -m "feat(worker): per-region resource position export (static JSON, data-repo bound)"
```

### Task 5: Worker — enemies + roads export

**Files:**
- Create: `apps/worker/src/roads-png.ts`, `apps/worker/src/roads-png.test.ts`
- Modify: `apps/worker/src/resource-snapshot.ts`, `apps/worker/package.json` (add `pngjs` + `@types/pngjs`)

- [ ] **Step 1: Write the failing test for road rasterization** (pure RGBA buffer logic; PNG encoding is a thin wrapper):

```ts
// apps/worker/src/roads-png.test.ts
import { describe, it, expect } from "vitest";
import { rasterizeRoads, SMALLHEX_PER_PX } from "./roads-png";

describe("rasterizeRoads", () => {
  it("maps small-hex points into a north-up RGBA grid with bounds", () => {
    // Two tiles: (960, 960) and (1920, 2880) small-hex.
    const r = rasterizeRoads([960, 960, 1920, 2880]);
    // Bounds snap to chunk coords (96 small-hex per chunk): min (10,10), max exclusive (20+1,30+1)
    expect(r.minChunkX).toBe(10); expect(r.minChunkZ).toBe(10);
    expect(r.maxChunkX).toBe(21); expect(r.maxChunkZ).toBe(31);
    expect(r.width).toBe(Math.ceil(((21 - 10) * 96) / SMALLHEX_PER_PX));
    // North-up: row 0 = max Z. Pixel for (960,960) is in the LAST rows (low z).
    const px = Math.floor((960 - 10 * 96) / SMALLHEX_PER_PX);
    const pz = Math.floor((960 - 10 * 96) / SMALLHEX_PER_PX);
    const row = r.height - 1 - pz;
    const o = (row * r.width + px) * 4;
    expect(r.rgba[o + 3]).toBeGreaterThan(0); // alpha set
  });
  it("returns null for empty input", () => {
    expect(rasterizeRoads([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** — `pnpm --filter @bcc/worker test -- roads-png` → FAIL (module not found). (If the worker has no vitest config, copy the pattern from `packages/shared` — a `vitest` devDep + `"test": "vitest run"` script — worker already has `ingest.test.ts`, so this should exist.)

- [ ] **Step 3: Implement**

```ts
// apps/worker/src/roads-png.ts
// Rasterize paved-tile positions into a transparent PNG overlay per region,
// north-up to match the terrain overlays (row 0 = max Z, same as render-terrain.py).
import { PNG } from "pngjs";

export const SMALLHEX_PER_PX = 8; // 12 px per chunk — crisp enough for roads, ~tiny files
const ROAD_RGBA: [number, number, number, number] = [232, 222, 196, 235]; // parchment, near-opaque

export interface RoadRaster {
  rgba: Uint8Array; width: number; height: number;
  minChunkX: number; minChunkZ: number; maxChunkX: number; maxChunkZ: number;
}

export function rasterizeRoads(xz: number[]): RoadRaster | null {
  if (xz.length < 2) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < xz.length; i += 2) {
    if (xz[i]! < minX) minX = xz[i]!;
    if (xz[i]! > maxX) maxX = xz[i]!;
    if (xz[i + 1]! < minZ) minZ = xz[i + 1]!;
    if (xz[i + 1]! > maxZ) maxZ = xz[i + 1]!;
  }
  const minChunkX = Math.floor(minX / 96), minChunkZ = Math.floor(minZ / 96);
  const maxChunkX = Math.floor(maxX / 96) + 1, maxChunkZ = Math.floor(maxZ / 96) + 1;
  const width = Math.ceil(((maxChunkX - minChunkX) * 96) / SMALLHEX_PER_PX);
  const height = Math.ceil(((maxChunkZ - minChunkZ) * 96) / SMALLHEX_PER_PX);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < xz.length; i += 2) {
    const px = Math.floor((xz[i]! - minChunkX * 96) / SMALLHEX_PER_PX);
    const pz = Math.floor((xz[i + 1]! - minChunkZ * 96) / SMALLHEX_PER_PX);
    const row = height - 1 - pz; // north-up
    if (px < 0 || px >= width || row < 0 || row >= height) continue;
    const o = (row * width + px) * 4;
    rgba[o] = ROAD_RGBA[0]; rgba[o + 1] = ROAD_RGBA[1]; rgba[o + 2] = ROAD_RGBA[2]; rgba[o + 3] = ROAD_RGBA[3];
  }
  return { rgba, width, height, minChunkX, minChunkZ, maxChunkX, maxChunkZ };
}

export function encodePng(r: RoadRaster): Buffer {
  const png = new PNG({ width: r.width, height: r.height });
  Buffer.from(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength).copy(png.data);
  return PNG.sync.write(png);
}
```

Install: `pnpm --filter @bcc/worker add pngjs && pnpm --filter @bcc/worker add -D @types/pngjs`

- [ ] **Step 4: Run the test** — `pnpm --filter @bcc/worker test -- roads-png` → PASS.

- [ ] **Step 5: Add enemies + roads stages to `resource-snapshot.ts`:**

```ts
async function exportEnemies(): Promise<Map<number, Record<string, number>>> {
  const counts = new Map<number, Record<string, number>>();
  await mkdir(join(OUT_PUBLIC, "enemies"), { recursive: true });
  for (const region of REGIONS) {
    const t = await readSnapshot(
      { ...conn, moduleName: regionModule(region) },
      [
        "SELECT * FROM enemy_state",
        "SELECT mobile_entity_state.* FROM mobile_entity_state JOIN enemy_state ON mobile_entity_state.entity_id = enemy_state.entity_id",
      ],
      ["enemy_state", "mobile_entity_state"], 180_000,
    );
    const typeByEntity = new Map<string, number>();
    for (const e of (t.get("enemy_state") ?? []) as Array<{ entity_id: unknown; enemy_type: unknown }>) {
      const v = e.enemy_type;
      const idx = Array.isArray(v) && typeof v[0] === "number" ? v[0] : undefined;
      if (idx !== undefined) typeByEntity.set(String(e.entity_id), idx); // variant index == enemy_desc.enemy_type
    }
    const types = packMobilePositions(
      (t.get("mobile_entity_state") ?? []) as Array<{ entity_id: string; location_x: number; location_z: number; dimension: number }>,
      typeByEntity,
    );
    await writeFile(join(OUT_PUBLIC, "enemies", `r${region}.json`), JSON.stringify({ v: 1, region, types }));
    for (const [type, xz] of Object.entries(types)) {
      (counts.get(Number(type)) ?? counts.set(Number(type), {}).get(Number(type))!)[String(region)] = xz.length / 2;
    }
    console.log(`[resource-snapshot] region ${region}: enemies ${Object.keys(types).length} types`);
  }
  return counts;
}

async function exportRoads() {
  await mkdir(join(OUT_PUBLIC, "roads"), { recursive: true });
  const manifest: Array<{ region: number; url: string; minX: number; minZ: number; maxX: number; maxZ: number }> = [];
  for (const region of REGIONS) {
    const t = await readSnapshot(
      { ...conn, moduleName: regionModule(region) },
      ["SELECT location_state.* FROM location_state JOIN paved_tile_state ON location_state.entity_id = paved_tile_state.entity_id"],
      ["location_state"], 300_000,
    );
    const xz = packPositions((t.get("location_state") ?? []) as Array<{ x: number; z: number; dimension: number }>);
    const raster = rasterizeRoads(xz);
    if (!raster) { console.log(`[resource-snapshot] region ${region}: no roads`); continue; }
    await writeFile(join(OUT_PUBLIC, "roads", `r${region}.png`), encodePng(raster));
    manifest.push({ region, url: `/map/roads/r${region}.png`, minX: raster.minChunkX, minZ: raster.minChunkZ, maxX: raster.maxChunkX, maxZ: raster.maxChunkZ });
    console.log(`[resource-snapshot] region ${region}: roads ${xz.length / 2} tiles -> r${region}.png`);
  }
  await writeFile(join(OUT_PUBLIC, "roads", "roads.json"), JSON.stringify(manifest));
}
```

Wire `main()` stages: `enemies` → `exportEnemies()`; `roads` → `exportRoads()`; `all` → catalogs, `exportResourcePositions()`, `exportEnemies()`, `exportRoads()`, then `upsertCatalogs(db, resources, creatures, resourceCounts, creatureCounts)`.

- [ ] **Step 6: Run both stages live** — `pnpm --filter @bcc/worker resource-snapshot enemies` then `… roads`. Expected: 9 JSON files in `apps/web/public/map/enemies/` (~100–300 KB each), 9 PNGs + `roads.json` in `apps/web/public/map/roads/`. Open one PNG — road lines should be visibly road-shaped, not noise.

- [ ] **Step 7: Run `all` once end-to-end** so `spawnCounts` lands in Postgres: `pnpm --filter @bcc/worker resource-snapshot all`. Verify: `SELECT name, spawn_counts FROM resources WHERE id = 23;` shows per-region counts.

- [ ] **Step 8: Copy resource files into local dev web** — `Copy-Item -Recurse apps/worker/out/map-data apps/web/public/map-data` (gitignored; this is the local stand-in for the CDN).

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/roads-png.ts apps/worker/src/roads-png.test.ts apps/worker/src/resource-snapshot.ts apps/worker/package.json pnpm-lock.yaml apps/web/public/map/enemies apps/web/public/map/roads
git commit -m "feat(worker): enemy + roads export (per-region JSON, road PNG overlays)"
```

### Task 6: Data repo + GitHub Actions workflow

**Files:**
- Create: `.github/workflows/resource-snapshot.yml`
- Docs: note in `docs/superpowers/specs/2026-06-10-bitjita-competitive-upgrade-design.md` is already covered; nothing to edit.

**USER-ACTION GATE (cannot be automated):** the repo owner must (1) create a public GitHub repo `bitcraftcompanion-map-data`, (2) add a fine-grained PAT with content-write on that repo as Actions secret `MAP_DATA_PUSH_TOKEN` in THIS repo, (3) set Netlify env `NEXT_PUBLIC_MAP_DATA_BASE=https://cdn.jsdelivr.net/gh/<owner>/bitcraftcompanion-map-data@main`. Pause and ask when you reach this task.

- [ ] **Step 1: Write the workflow** (manual dispatch only — this is NOT the 30-min loop):

```yaml
# .github/workflows/resource-snapshot.yml
name: resource-snapshot
on:
  workflow_dispatch: {}

jobs:
  snapshot:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Run snapshot (all stages)
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SPACETIME_URI: ${{ secrets.SPACETIME_URI }}
          SPACETIME_MODULE: ${{ secrets.SPACETIME_MODULE }}
          SPACETIME_GLOBAL_MODULE: ${{ secrets.SPACETIME_GLOBAL_MODULE }}
          SPACETIME_TOKEN: ${{ secrets.SPACETIME_TOKEN }}
          INGESTION_ENABLED: "true"
        run: pnpm --filter @bcc/worker resource-snapshot all
      - name: Push position files to data repo
        env:
          TOKEN: ${{ secrets.MAP_DATA_PUSH_TOKEN }}
        run: |
          git clone --depth 1 "https://x-access-token:${TOKEN}@github.com/${{ github.repository_owner }}/bitcraftcompanion-map-data.git" /tmp/map-data
          rm -rf /tmp/map-data/resources
          cp -r apps/worker/out/map-data/resources /tmp/map-data/resources
          cd /tmp/map-data
          git config user.name "bcc-worker" && git config user.email "actions@github.com"
          git add -A
          git diff --cached --quiet || git commit -m "resource positions $(date -u +%F)"
          git push
      - name: Commit enemies + roads to app repo
        run: |
          git config user.name "bcc-worker" && git config user.email "actions@github.com"
          git add apps/web/public/map/enemies apps/web/public/map/roads
          git diff --cached --quiet || git commit -m "chore(map): refresh enemy + road overlays [skip ci]"
          git push
```

Check the existing `.github/workflows/` snapshot workflow first and mirror its checkout/pnpm/node versions exactly (the repo previously hit a pnpm version conflict — `packageManager` field drives the version; do NOT add a `version:` key to pnpm/action-setup).

- [ ] **Step 2: Validate YAML** — `pnpm dlx yaml-lint .github/workflows/resource-snapshot.yml` (or open it in the editor — CI will also catch it). Do NOT trigger it yet (needs the user-created secrets).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/resource-snapshot.yml
git commit -m "ci: manual resource-snapshot workflow (data repo push + overlay refresh)"
```

### Task 7: Web — resources queries + list page

**Files:**
- Create: `apps/web/lib/queries/resources.ts`, `apps/web/app/resources/page.tsx`

- [ ] **Step 1: Queries** (mirror `apps/web/lib/queries/items.ts` exactly — `server-only`, Drizzle, count + page):

```ts
// apps/web/lib/queries/resources.ts
import "server-only";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type ResourceRow = typeof schema.resources.$inferSelect;
export const RESOURCES_PAGE_SIZE = 25;

export interface ResourceListParams { q?: string; category?: string; tier?: number; page: number }

export async function listResources(params: ResourceListParams) {
  const db = getDb();
  const conds = [eq(schema.resources.compendiumEntry, true)];
  if (params.q) conds.push(ilike(schema.resources.name, `%${params.q}%`));
  if (params.category) conds.push(eq(schema.resources.category, params.category));
  if (params.tier !== undefined) conds.push(eq(schema.resources.tier, params.tier));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.resources).where(where);
  const rows = await db.select().from(schema.resources).where(where)
    .orderBy(asc(schema.resources.name))
    .limit(RESOURCES_PAGE_SIZE).offset((params.page - 1) * RESOURCES_PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: RESOURCES_PAGE_SIZE };
}

export async function listResourceCategories(): Promise<string[]> {
  const db = getDb();
  const rows = await db.selectDistinct({ category: schema.resources.category }).from(schema.resources)
    .where(eq(schema.resources.compendiumEntry, true));
  return rows.map((r) => r.category).filter((c): c is string => !!c).sort();
}

export async function getResourceBySlug(slug: string): Promise<ResourceRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.resources).where(eq(schema.resources.slug, slug)).limit(1);
  return row ?? null;
}

/** Slim catalog for the map finder panel (all 513, incl. non-compendium). */
export async function getResourceMapCatalog() {
  const db = getDb();
  return db.select({
    id: schema.resources.id, slug: schema.resources.slug, name: schema.resources.name,
    category: schema.resources.category, tier: schema.resources.tier,
    spawnCounts: schema.resources.spawnCounts,
  }).from(schema.resources).orderBy(asc(schema.resources.name));
}
```

- [ ] **Step 2: List page.** OPEN `apps/web/app/items/page.tsx` FIRST and clone its structure (metadata, searchParams parsing, stat header, table + mobile cards, Pager, EntityIcon usage, `revalidate` value). Adapt: columns Name (icon + link to `/resources/[slug]`), Category, Tier, Rarity, Health, Respawn; filters = search box + category `<select>` + tier `<select>`; humanize respawn with a local helper:

```ts
export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
```

(put it in `apps/web/lib/format.ts` if that module exists — check first — else co-locate in `lib/queries/resources.ts` and export). Stat cards: Total resources, Categories, Respawning count (`SELECT count(*) WHERE not_respawning = false` — add a tiny `getResourceStats()` query alongside `listResources`). Each row links to detail; add a "Find on map →" link per row pointing at `/map?resources={id}` (works after Task 12).

- [ ] **Step 3: Verify in dev** — `pnpm --filter @bcc/web dev`, open `http://localhost:3000/resources`: 345 compendium resources paged, search "oak" narrows, category filter works, respawn shows "3h" not "10800.0s".

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/lib/queries/resources.ts apps/web/app/resources/page.tsx apps/web/lib/format.ts
git commit -m "feat(web): /resources compendium list (category/tier filters, humanized respawn)"
```

### Task 8: Web — resource detail page (yields + stats; map embed lands in Task 13)

**Files:**
- Create: `apps/web/app/resources/[slug]/page.tsx`

- [ ] **Step 1: Build the page.** Clone the structure of `apps/web/app/items/[slug]/page.tsx` (open it first): `generateMetadata` from name/description, breadcrumb back-link, header (EntityIcon, name, tier/rarity/category badges), stats grid (Max health, Respawn time via `formatDuration`, Respawning yes/no), description paragraph. THE BEAT-BITJITA SECTION — **Yields**: for each `yields[{itemId, qty}]`, look up the item by id (`db.select().from(schema.items).where(inArray(schema.items.id, ids))`) and render icon + name linked to `/items/[slug]` + "×qty". Add a "Spawns in" section listing region names + counts from `spawnCounts` (region names: reuse the regions lookup used by settlements/map — check `apps/web/lib/queries/map.ts:getMapRegions` and match ids), each linking to `/map?resources={id}&regions={region}`. Add `generateStaticParams` from all slugs ONLY if the items detail page does it — mirror that file's ISR/`revalidate` approach exactly.

- [ ] **Step 2: Verify in dev** — `/resources/ancient-oak-tree`: yields show linked items, spawn counts per region render, no raw seconds anywhere.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/app/resources
git commit -m "feat(web): resource detail page with item yields + per-region spawn counts"
```

### Task 9: Web — creatures queries, list, detail

**Files:**
- Create: `apps/web/lib/queries/creatures.ts`, `apps/web/app/creatures/page.tsx`, `apps/web/app/creatures/[slug]/page.tsx`

- [ ] **Step 1: Queries** — same shape as Task 7 (`listCreatures` with `q`/`huntable` params + page over 41 rows, `getCreatureBySlug`, `getCreatureMapCatalog` slim select of `{enemyType, slug, name, tier, spawnCounts}`).

- [ ] **Step 2: List page** — stat cards (Total creatures, Huntable count, Monsters count), table columns: Name, Category (tag), Tier, Rarity, Health, Damage ("15–27"), Armor, Huntable. Mirror the items list template.

- [ ] **Step 3: Detail page** — header + badges + description; **Combat stats** grid (HP, damage range, armor, accuracy, evasion, attack/defense level, regen "5.0/s"); **Detection & aggro** day vs night two-column block (beat bitjita: label plainly — "Spots you from 30 tiles (day) / 40 tiles (night)"); **Loot** section: `lootStacks` entries are `[[itemId, qty], …]` — resolve against `items` like Task 8 yields and link them (bitjita does NOT have this); **Spawns in** region list linking `/map?creatures={enemyType}&regions={r}`.

- [ ] **Step 4: Verify** — `/creatures` lists 41; `/creatures/alpha-jakyl` shows combat stats + loot links.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/lib/queries/creatures.ts apps/web/app/creatures
git commit -m "feat(web): /creatures compendium with combat stats, loot links, spawn regions"
```

### Task 10: Map — tracking state helpers + canvas points layer (TDD on helpers)

**Files:**
- Create: `apps/web/lib/map/tracking.ts`, `apps/web/lib/map/tracking.test.ts`, `apps/web/components/map/ResourcePointsLayer.tsx`

- [ ] **Step 1: Failing tests for the pure helpers**

```ts
// apps/web/lib/map/tracking.test.ts
import { describe, it, expect } from "vitest";
import { parseTrackParams, serializeTrackParams, decimate, trackColor, TRACK_COLORS } from "./tracking";

describe("track URL params", () => {
  it("parses comma lists, dropping junk", () => {
    expect(parseTrackParams({ resources: "23,51,abc", creatures: "18", regions: "7" }))
      .toEqual({ resources: [23, 51], creatures: [18], regions: [7], roads: false });
  });
  it("round-trips", () => {
    const s = { resources: [23], creatures: [], regions: [7, 9], roads: true };
    expect(parseTrackParams(serializeTrackParams(s))).toEqual(s);
  });
  it("serializes empty state to an empty object", () => {
    expect(serializeTrackParams({ resources: [], creatures: [], regions: [], roads: false })).toEqual({});
  });
});

describe("decimate", () => {
  it("returns input when under budget", () => {
    const xz = [1, 2, 3, 4];
    expect(decimate(xz, 10)).toBe(xz);
  });
  it("samples evenly to ~budget pairs, keeping pairs aligned", () => {
    const xz = Array.from({ length: 200 }, (_, i) => i); // 100 points
    const out = decimate(xz, 25);
    expect(out.length % 2).toBe(0);
    expect(out.length / 2).toBeLessThanOrEqual(26);
    expect(out.slice(0, 2)).toEqual([0, 1]);
  });
});

describe("trackColor", () => {
  it("cycles the palette by track order", () => {
    expect(trackColor(0)).toBe(TRACK_COLORS[0]);
    expect(trackColor(TRACK_COLORS.length)).toBe(TRACK_COLORS[0]);
  });
});
```

- [ ] **Step 2: Run** — `pnpm --filter @bcc/web test -- tracking` → FAIL. (If the web package lacks a vitest setup, add `vitest` devDep + `"test": "vitest run"` script, mirroring `packages/shared/package.json` — keep config minimal, node environment is fine for pure helpers.)

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/map/tracking.ts
// Pure helpers for the map finder: URL state, point decimation, track colors.

export interface TrackState { resources: number[]; creatures: number[]; regions: number[]; roads: boolean }

const numList = (v: string | string[] | undefined): number[] =>
  (typeof v === "string" ? v : "").split(",").map((s) => Number(s)).filter((n) => Number.isInteger(n) && n >= 0);

export function parseTrackParams(sp: Record<string, string | string[] | undefined>): TrackState {
  return {
    resources: numList(sp.resources),
    creatures: numList(sp.creatures),
    regions: numList(sp.regions),
    roads: sp.roads === "1",
  };
}

export function serializeTrackParams(s: TrackState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.resources.length) out.resources = s.resources.join(",");
  if (s.creatures.length) out.creatures = s.creatures.join(",");
  if (s.regions.length) out.regions = s.regions.join(",");
  if (s.roads) out.roads = "1";
  return out;
}

/** Even-stride sample of a flat [x,z,…] array down to ~budget points (keeps pairs aligned). */
export function decimate(xz: number[], budgetPoints: number): number[] {
  const points = xz.length / 2;
  if (points <= budgetPoints) return xz;
  const stride = Math.ceil(points / budgetPoints);
  const out: number[] = [];
  for (let p = 0; p < points; p += stride) out.push(xz[p * 2]!, xz[p * 2 + 1]!);
  return out;
}

export const TRACK_COLORS = ["#f5c451", "#6ec1e4", "#e4756e", "#8bd17c", "#c79bf2", "#f2a25c", "#7ce4cf", "#e486c7"] as const;
export const trackColor = (i: number): string => TRACK_COLORS[i % TRACK_COLORS.length]!;
```

- [ ] **Step 4: Run tests** → PASS. Commit the helpers alone:

```bash
git add apps/web/lib/map apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): map tracking helpers (URL state, decimation, palette)"
```

- [ ] **Step 5: Canvas layer component.** A single `<canvas>` overlaid via Leaflet pane, redrawn on move/zoom — NOT React markers (50k+ points). Convention notes: game (x,z) → Leaflet latLng is `[z, x]` in CHUNK coords (`pt` in WorldMap.tsx); small-hex ÷ 96 → chunk.

```tsx
// apps/web/components/map/ResourcePointsLayer.tsx
"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { DomUtil } from "leaflet";
import { decimate } from "@/lib/map/tracking";

export interface TrackedPoints { key: string; color: string; xz: number[] } // xz = small-hex flat pairs

const MAX_DRAW_POINTS = 60_000;

/** Draws all tracked spawn points on one canvas in Leaflet's overlay pane. */
export function ResourcePointsLayer({ tracked }: { tracked: TrackedPoints[] }) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = DomUtil.create("canvas") as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "450"; // above overlays, below markers/popups
    map.getPanes().overlayPane.appendChild(canvas);
    canvasRef.current = canvas;
    return () => { canvas.remove(); canvasRef.current = null; };
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const size = map.getSize();
      canvas.width = size.x; canvas.height = size.y;
      // Pin the canvas to the current view (overlayPane is translated as the map pans).
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      DomUtil.setPosition(canvas, topLeft);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bounds = map.getBounds();
      const budget = Math.max(2_000, Math.floor(MAX_DRAW_POINTS / Math.max(1, tracked.length)));
      for (const t of tracked) {
        ctx.fillStyle = t.color;
        const xz = decimate(t.xz, budget);
        for (let i = 0; i < xz.length; i += 2) {
          const cx = xz[i]! / 96, cz = xz[i + 1]! / 96; // small-hex -> chunk
          if (cz < bounds.getSouth() || cz > bounds.getNorth() || cx < bounds.getWest() || cx > bounds.getEast()) continue;
          const p = map.latLngToContainerPoint([cz, cx]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    draw();
    map.on("moveend zoomend resize", draw);
    return () => { map.off("moveend zoomend resize", draw); };
  }, [map, tracked]);

  return null;
}
```

- [ ] **Step 6: Smoke-test inside WorldMap** temporarily: in `WorldMap.tsx`, fetch the real file once on mount (`fetch("/map-data/resources/r7/23.json").then(r => r.json())` into local state) and render `<ResourcePointsLayer tracked={[{ key: "smoke", color: "#f5c451", xz: data?.xz ?? [] }]} />` inside `<MapContainer>`. Expected: ~3k golden dots over region 7's forests. Remove the hardcode after confirming. (Full wiring is Task 11/12.)

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/components/map/ResourcePointsLayer.tsx
git commit -m "feat(web): canvas spawn-point layer (decimated, color-coded)"
```

### Task 11: Map — finder panel (search + category browse + chips)

**Files:**
- Create: `apps/web/components/map/MapFinderPanel.tsx`
- Modify: `apps/web/components/map/WorldMap.tsx`, `MapClient.tsx`, `apps/web/app/map/page.tsx`

- [ ] **Step 1: Thread catalogs into the map.** In `app/map/page.tsx`: import `getResourceMapCatalog` (Task 7) and `getCreatureMapCatalog` (Task 9), add both to the existing `Promise.all`, pass to `<MapClient resourceCatalog={…} creatureCatalog={…} …>`; extend `MapClient` props passthrough and `WorldMap` props the same way. Define the slim types in the panel file and import them in all three (page → client → map).

- [ ] **Step 2: Build the panel.** Renders ABOVE the map (next to the existing "Focus region" select — same row, `flex-wrap`):

```tsx
// apps/web/components/map/MapFinderPanel.tsx
"use client";
import { useMemo, useRef, useState } from "react";
import { trackColor } from "@/lib/map/tracking";

export interface FinderResource { id: number; slug: string; name: string; category: string | null; tier: number | null; spawnCounts: Record<string, number> }
export interface FinderCreature { enemyType: number; slug: string; name: string; tier: number | null; spawnCounts: Record<string, number> }
export interface TrackedRef { kind: "resource" | "creature"; id: number }

export function MapFinderPanel({ resources, creatures, tracked, onToggle, onClear }: {
  resources: FinderResource[];
  creatures: FinderCreature[];
  tracked: TrackedRef[];
  onToggle: (ref: TrackedRef) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) if (r.category && Object.keys(r.spawnCounts).length) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resources]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return { res: [] as FinderResource[], cre: [] as FinderCreature[] };
    return {
      res: resources.filter((r) => r.name.toLowerCase().includes(needle)).slice(0, 12),
      cre: creatures.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 6),
    };
  }, [q, resources, creatures]);

  const isTracked = (kind: TrackedRef["kind"], id: number) => tracked.some((t) => t.kind === kind && t.id === id);
  const trackedIndex = (kind: TrackedRef["kind"], id: number) => tracked.findIndex((t) => t.kind === kind && t.id === id);

  return (
    <div className="mb-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative w-full sm:w-80">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find resources & creatures (e.g. iron, oak, jakyl)…"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            aria-label="Find resources and creatures on the map"
          />
          {(results.res.length > 0 || results.cre.length > 0) && (
            <ul className="absolute z-[1200] mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
              {results.res.map((r) => (
                <li key={`r${r.id}`}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-background"
                    onClick={() => { onToggle({ kind: "resource", id: r.id }); setQ(""); inputRef.current?.focus(); }}>
                    <span>{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.category} · T{r.tier}</span>
                  </button>
                </li>
              ))}
              {results.cre.map((c) => (
                <li key={`c${c.enemyType}`}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-background"
                    onClick={() => { onToggle({ kind: "creature", id: c.enemyType }); setQ(""); inputRef.current?.focus(); }}>
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">Creature · T{c.tier}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Browse by category — the thing bitjita's map doesn't have. */}
        <select
          value={openCategory ?? ""}
          onChange={(e) => setOpenCategory(e.target.value || null)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          aria-label="Browse resources by category"
        >
          <option value="">Browse category…</option>
          {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        {tracked.length > 0 && (
          <button type="button" onClick={onClear} className="h-9 text-primary underline">Clear all</button>
        )}
      </div>

      {openCategory && (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
          {resources
            .filter((r) => r.category === openCategory && Object.keys(r.spawnCounts).length)
            .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name))
            .map((r) => (
              <button key={r.id} type="button"
                onClick={() => onToggle({ kind: "resource", id: r.id })}
                aria-pressed={isTracked("resource", r.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${isTracked("resource", r.id) ? "border-primary bg-primary/15" : "border-border hover:bg-background"}`}>
                {r.name} <span className="text-muted-foreground">T{r.tier}</span>
              </button>
            ))}
        </div>
      )}

      {tracked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tracked.map((t) => {
            const meta = t.kind === "resource" ? resources.find((r) => r.id === t.id) : creatures.find((c) => c.enemyType === t.id);
            return (
              <span key={`${t.kind}${t.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: trackColor(trackedIndex(t.kind, t.id)) }} />
                {meta?.name ?? `${t.kind} ${t.id}`}
                <button type="button" aria-label={`Stop tracking ${meta?.name}`} onClick={() => onToggle(t)} className="text-muted-foreground hover:text-foreground">✕</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire state + data fetch in `WorldMap.tsx`.** Add at the top of the component:

```tsx
const [tracked, setTracked] = useState<TrackedRef[]>(initialTracked ?? []);
const [pointsByKey, setPointsByKey] = useState<Map<string, number[]>>(new Map());

const DATA_BASE = process.env.NEXT_PUBLIC_MAP_DATA_BASE ?? "/map-data";

// Fetch position files for newly tracked refs (per active region; all regions when none focused).
useEffect(() => {
  let alive = true;
  const regionIds = selectedId !== null ? [selectedId] : activeRegionIdsWithData; // see note below
  for (const t of tracked) {
    for (const region of regionIds) {
      const key = `${t.kind}:${t.id}:r${region}`;
      if (pointsByKey.has(key)) continue;
      const url = t.kind === "resource"
        ? `${DATA_BASE}/resources/r${region}/${t.id}.json`
        : `/map/enemies/r${region}.json`;
      fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!alive || !j) return;
        const xz: number[] = t.kind === "resource" ? (j.xz ?? []) : (j.types?.[String(t.id)] ?? []);
        setPointsByKey((m) => new Map(m).set(key, xz));
      }).catch(() => {});
    }
  }
  return () => { alive = false; };
}, [tracked, selectedId]);
```

`activeRegionIdsWithData`: derive from catalog `spawnCounts` keys of the tracked entries (union), intersected with `regions.map(r => r.id)`. Build the `trackedPoints: TrackedPoints[]` for the layer by concatenating each tracked ref's region arrays with `trackColor(index)`. Enemy region files are shared per region — fetch once per region and slice per type (the `key` scheme above already caches by `t.id` + region; acceptable duplication, the files are ~200 KB).

Render: `<MapFinderPanel resources={resourceCatalog} creatures={creatureCatalog} tracked={tracked} onToggle={toggle} onClear={() => setTracked([])} />` above the map (next to the Focus-region row) and `<ResourcePointsLayer tracked={trackedPoints} />` inside `<MapContainer>`.

`onToggle`: add if absent, remove if present:

```tsx
const toggle = (ref: TrackedRef) =>
  setTracked((cur) => cur.some((t) => t.kind === ref.kind && t.id === ref.id)
    ? cur.filter((t) => !(t.kind === ref.kind && t.id === ref.id))
    : [...cur, ref]);
```

- [ ] **Step 4: Verify in dev** — on `/map`: search "oak" → click "Ancient Oak Tree" → golden dots blanket forests; add "Iron" something + a creature → distinct colors + chips; category browse "Ore Vein" lists tiered chips; ✕ removes; Focus region narrows fetches. Watch the Network tab: position files load lazily, once each.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/components/map apps/web/app/map/page.tsx
git commit -m "feat(map): resource/creature finder — search, category browse, multi-track chips"
```

### Task 12: Map — shareable URLs + copy link

**Files:**
- Modify: `apps/web/app/map/page.tsx`, `apps/web/components/map/WorldMap.tsx`, `MapClient.tsx`

- [ ] **Step 1: Parse searchParams server-side.** `app/map/page.tsx` receives `searchParams` (Next 16: `searchParams: Promise<Record<string, string | string[] | undefined>>` — await it; match how other pages in this repo type it, e.g. items). `const initial = parseTrackParams(await searchParams)` → pass `initialTracked` (map `resources`→`{kind:"resource"}`, `creatures`→`{kind:"creature"}`), `initialRegionId` (first of `regions`), `initialRoads` through MapClient to WorldMap.

- [ ] **Step 2: Sync state → URL** in WorldMap (replaceState, no navigation). Declare the roads state here too (the Roads layer itself lands in Task 13 — until then the flag just round-trips through the URL):

```tsx
const [roadsOn, setRoadsOn] = useState<boolean>(initialRoads ?? false);

useEffect(() => {
  const state: TrackState = {
    resources: tracked.filter((t) => t.kind === "resource").map((t) => t.id),
    creatures: tracked.filter((t) => t.kind === "creature").map((t) => t.id),
    regions: selectedId !== null ? [selectedId] : [],
    roads: roadsOn,
  };
  const qs = new URLSearchParams(serializeTrackParams(state)).toString();
  window.history.replaceState(null, "", qs ? `/map?${qs}` : "/map");
}, [tracked, selectedId, roadsOn]);
```

- [ ] **Step 3: Copy-link button** next to the finder panel's Clear button:

```tsx
const [copied, setCopied] = useState(false);
<button type="button" className="h-9 text-primary underline"
  onClick={() => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
  {copied ? "Copied!" : "Copy link to view"}
</button>
```

- [ ] **Step 4: Verify** — track two resources + focus a region → URL shows `?resources=23,51&regions=7`; open that URL in a fresh tab → identical tracked state; copy-link works.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/app/map/page.tsx apps/web/components/map
git commit -m "feat(map): shareable tracking URLs + copy-link"
```

### Task 13: Map — roads overlay toggle + detail-page embedded maps

**Files:**
- Modify: `apps/web/app/map/page.tsx` (load roads manifest), `WorldMap.tsx`, `MapClient.tsx`
- Create: `apps/web/components/map/ResourceMapEmbed.tsx`
- Modify: `apps/web/app/resources/[slug]/page.tsx`, `apps/web/app/creatures/[slug]/page.tsx`

- [ ] **Step 1: Roads layer.** In `app/map/page.tsx`, load the manifest exactly like `loadTerrain()` does (same file, same try/catch-empty pattern) from `public/map/roads/roads.json`, mapping to `{ region, url, bounds: [[minZ, minX], [maxZ, maxX]] }`. Pass `roads` through to WorldMap. Inside `<LayersControl>` add (checked = `initialRoads`, spec says off by default):

```tsx
<LayersControl.Overlay name="Roads">
  <LayerGroup>
    {roads.map((r) => <ImageOverlay key={`road-${r.region}`} url={r.url} bounds={r.bounds} zIndex={6} />)}
  </LayerGroup>
</LayersControl.Overlay>
```

Track its checked state for the URL param: listen to the map's `overlayadd`/`overlayremove` events (`useMapEvents` or `map.on` in an effect) filtering `name === "Roads"` → `setRoadsOn`. Persist like other layers: this repo doesn't persist layer state yet — add localStorage `bcc.map.roads` ("1"/"0") read at mount, written in the same handler (matches spec's "persisted in localStorage").

- [ ] **Step 2: Embedded map on detail pages.** Create a thin server wrapper that reuses the FULL map data fetchers (consistent, cached by ISR):

```tsx
// apps/web/components/map/ResourceMapEmbed.tsx
import { getMapClaims, getMapRegions, getTerritoryCells, getWatchtowers, getEmpireTerritories } from "@/lib/queries/map";
import { getResourceMapCatalog } from "@/lib/queries/resources";
import { getCreatureMapCatalog } from "@/lib/queries/creatures";
import { MapClient } from "./MapClient";

/** Server component: the world map pre-tracking one resource/creature (detail-page embed). */
export async function ResourceMapEmbed({ kind, id }: { kind: "resource" | "creature"; id: number }) {
  const [claims, regions, territory, watchtowers, empires, resourceCatalog, creatureCatalog] = await Promise.all([
    getMapClaims(), getMapRegions(), getTerritoryCells(), getWatchtowers(), getEmpireTerritories(),
    getResourceMapCatalog(), getCreatureMapCatalog(),
  ]);
  return (
    <MapClient
      claims={claims} regions={regions} territory={territory} watchtowers={watchtowers} empires={empires}
      terrain={[]} roads={[]}
      resourceCatalog={resourceCatalog} creatureCatalog={creatureCatalog}
      initialTracked={[{ kind, id }]}
      compact
    />
  );
}
```

`terrain={[]}` keeps the embed light (no big terrain images); pass a `compact` prop down to WorldMap that (a) hides the finder panel's category browse, (b) uses `h-[50vh]`, (c) keeps chips + region focus visible. NOTE: `loadTerrain` lives in the map page — if you prefer terrain in embeds later, lift it to a lib; NOT now (YAGNI).

- [ ] **Step 3: Embed in both detail pages** under a "Where to find it" heading:

```tsx
<section className="mt-8">
  <h2 className="text-xl font-semibold">Where to find it</h2>
  <p className="mt-1 text-sm text-muted-foreground">Every known spawn point. <a className="text-primary underline" href={`/map?${kind === "resource" ? "resources" : "creatures"}=${id}`}>Open full map →</a></p>
  <div className="mt-3"><ResourceMapEmbed kind="resource" id={resource.id} /></div>
</section>
```

- [ ] **Step 4: Verify** — `/map`: Roads checkbox draws road lattice aligned with terrain (compare against a settlement-dense area; if visibly offset, apply the same `TERRAIN_DX/DZ` nudge used for terrain bounds in `app/map/page.tsx`). `/resources/ancient-oak-tree`: embedded map auto-shows oak points; "Open full map →" carries tracking over. URL `?roads=1` restores the layer.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @bcc/web typecheck
git add apps/web/components/map apps/web/app
git commit -m "feat(map): roads overlay toggle + embedded finder maps on detail pages"
```

### Task 14: Navigation, sitemap, full verification

**Files:**
- Modify: navbar component (find it: `apps/web/components/` — the file rendering Compendium links to /items, /cargo, /buildings), homepage `apps/web/app/page.tsx` (feature tiles), `apps/web/app/sitemap.ts`, `apps/web/app/compendium/page.tsx`

- [ ] **Step 1: Add links** — "Resources" and "Creatures" wherever Items/Cargo/Buildings appear (navbar compendium group, compendium hub cards, homepage tiles if present). Mirror the exact markup of the existing entries.

- [ ] **Step 2: Sitemap** — add `/resources`, `/creatures`, and the per-slug dynamic entries following the items pattern in `apps/web/app/sitemap.ts`.

- [ ] **Step 3: Full verification suite**

```bash
pnpm --filter @bcc/shared test
pnpm --filter @bcc/worker test
pnpm --filter @bcc/web test
pnpm --filter @bcc/shared typecheck && pnpm --filter @bcc/worker typecheck && pnpm --filter @bcc/web typecheck
pnpm --filter @bcc/web build
```

Expected: all green; `next build` succeeds with the new routes listed.

- [ ] **Step 4: Manual acceptance pass** (dev server) against the spec's success criteria:
  - Type "iron" on `/map` → click a result → spawn points render in <2 s; URL is shareable.
  - Track 3 things at once → 3 colors + 3 chips; remove middle chip → colors stay stable for the rest (NOTE: `trackColor(trackedIndex(...))` — index shifts on removal are acceptable v1; if it looks jarring, assign color at track time instead and store it in state — 5-line change).
  - Roads toggle on/off; persists across reload (localStorage) and via `?roads=1`.
  - `/resources` list: humanized respawn, category/tier filters, yields on detail, embedded map.
  - `/creatures/alpha-jakyl`: combat stats, plain-language detection copy, loot links.
  - No raw seconds, raw enum arrays, or numeric-ID-only labels anywhere on the new pages.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): wire resources/creatures into nav, compendium hub, sitemap"
```

---

## Self-review notes (kept for the executor)

- **Spec coverage:** A1 pipeline (Tasks 3–6), A2 map UX — search ✅(11), category browse ✅(11), chips ✅(11), region scoping ✅(11 via focus + spawnCounts), shareable URLs + copy ✅(12), roads toggle ✅(13), human formatting ✅(7, `formatDuration`); A3 compendium ✅(7–9, 13) incl. yields/loot (the beat-bitjita data triangle). Deliberately NOT in Phase A: clustering UI (canvas + decimation covers perf), live depletion (no always-on infra), GeoJSON waypoints (Phase D).
- **Multi-region tracking** is via spawnCounts-driven fetches + region focus rather than a multi-select regions control; the URL `regions` param accepts a list for forward-compat but the UI sets at most one (the focus). Acceptable v1 — note in PR description.
- **Type consistency checked:** `TrackedRef`/`TrackState`/`TrackedPoints` defined once each (panel / tracking lib / layer); `packPositions` consumed by worker Tasks 4–5; `trackColor(i)` palette shared panel↔layer.
- **Risk valves:** region OOM → per-id fallback (Task 4 strategy note); jsDelivr cache staleness → pin `@main` is fine for static spawns; if a tracked fetch 404s (region without that resource) the code treats it as empty — by design.
