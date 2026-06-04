# BitCraft Companion — Phase 1a: Compendium Ingestion & Data Model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull BitCraft's descriptive game data (items incl. food/equipment, cargo, buildings, crafting + construction recipes) into Postgres via a read-only snapshot, modeled cleanly with a craft graph — the data foundation the Phase 1b website reads.

**Architecture:** A one-shot **snapshot** job in `apps/worker` opens a read-only `v1.json.spacetimedb` WebSocket to `bitcraft-global`, subscribes to the `*_desc` tables, receives the initial snapshot, and idempotently upserts normalized rows into Postgres. All wire-parsing, row-normalizing, and entity-mapping logic lives as pure, fixture-tested functions in `packages/shared`; only the thin WebSocket transport lives in the worker. Never calls a reducer.

**Tech Stack:** TypeScript, `ws` (WebSocket client with custom headers), Drizzle ORM + Postgres, Vitest, Zod (existing). Builds on merged Phase 0.

**Spec:** `docs/superpowers/specs/2026-06-04-bitcraft-companion-phase-1-compendium-design.md`
**Schema reference:** `docs/reference/bitcraft-tables.txt`; regenerate full schema with `pnpm --filter @bcc/worker probe` (writes gitignored `docs/reference/bitcraft-schema.json`).

---

## Protocol reference (verified)

- URL: `wss://bitcraft-early-access.spacetimedb.com/v1/database/bitcraft-global/subscribe`
- Subprotocol: `v1.json.spacetimedb`; Header: `Authorization: Bearer <SPACETIME_TOKEN>`
- Client → server: `{"Subscribe":{"query_strings":["SELECT * FROM item_desc"],"request_id":1}}`
- Server → client (relevant): `{"InitialSubscription":{"database_update":{"tables":[{"table_name":"item_desc","updates":[{"inserts":["<json-string-row>", ...]}]}]},"request_id":1}}`
- Each element of `inserts` is a **JSON string**; `JSON.parse` it to get a row. Row encoding (positional array vs keyed object, enum form) is confirmed empirically in Task 9; the normalizer (Task 3) handles both.

## File structure

```
packages/shared/src/
  spacetime/
    subscription-message.ts        # pure parser: extract table inserts from a server message
    subscription-message.test.ts
  ingest/
    normalize-row.ts               # raw insert (array|object) -> keyed record via column order
    normalize-row.test.ts
    column-orders.ts               # COLUMN_ORDER per source table (from resolved schema)
    decode.ts                      # rarity + enum/number/string decoders, slugify
    decode.test.ts
    map-entities.ts                # mapItemRow / mapCargoRow / mapBuildingRow (raw -> DB insert)
    map-entities.test.ts
    map-recipes.ts                 # mapRecipeRow + buildRecipeGraph (-> recipe_inputs/outputs)
    map-recipes.test.ts
  db/
    schema.ts                      # (extend) items, item_food, item_equipment, cargo, buildings,
                                   #          recipes, recipe_inputs, recipe_outputs + indexes
apps/worker/src/
  spacetime/
    ws-snapshot.ts                 # thin `ws` transport: connect, subscribe, collect, close
  snapshot.ts                      # orchestrate: read -> map -> upsert -> audit -> exit
```

---

## Task 1: Add the `ws` dependency to the worker

**Files:** Modify `apps/worker/package.json`

- [ ] **Step 1: Add deps**

In `apps/worker/package.json`, add to `dependencies`: `"ws": "^8.18.0"`, and to `devDependencies`: `"@types/ws": "^8.5.12"`.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: installs `ws` and `@types/ws`, updates `pnpm-lock.yaml`.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/package.json pnpm-lock.yaml
git commit -m "chore(worker): add ws dependency for snapshot transport"
```

---

## Task 2: Pure server-message parser (TDD)

**Files:**
- Create: `packages/shared/src/spacetime/subscription-message.ts`, `packages/shared/src/spacetime/subscription-message.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/spacetime/subscription-message.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractTableInserts } from "./subscription-message";

const initial = {
  InitialSubscription: {
    request_id: 1,
    database_update: {
      tables: [
        {
          table_name: "item_desc",
          updates: [{ inserts: ['{"id":1,"name":"Stone"}', '{"id":2,"name":"Wood"}'] }],
        },
        { table_name: "cargo_desc", updates: [{ inserts: ['{"id":9,"name":"Log"}'] }] },
      ],
    },
  },
};

describe("extractTableInserts", () => {
  it("returns parsed rows grouped by table name", () => {
    const out = extractTableInserts(initial);
    expect(out.get("item_desc")).toEqual([{ id: 1, name: "Stone" }, { id: 2, name: "Wood" }]);
    expect(out.get("cargo_desc")).toEqual([{ id: 9, name: "Log" }]);
  });

  it("returns an empty map for non-subscription messages", () => {
    expect(extractTableInserts({ IdentityToken: {} }).size).toBe(0);
  });

  it("merges inserts across multiple update groups for one table", () => {
    const msg = {
      InitialSubscription: {
        database_update: {
          tables: [{ table_name: "t", updates: [{ inserts: ['{"a":1}'] }, { inserts: ['{"a":2}'] }] }],
        },
      },
    };
    expect(extractTableInserts(msg).get("t")).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/spacetime/subscription-message.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/spacetime/subscription-message.ts`:

```ts
/** A parsed row from a SpacetimeDB JSON subscription (array or keyed object). */
export type RawRow = unknown;

interface TableUpdate {
  table_name?: string;
  updates?: Array<{ inserts?: string[] }>;
}
interface ServerMessage {
  InitialSubscription?: { database_update?: { tables?: TableUpdate[] } };
}

/**
 * Extract inserted rows from a v1.json SpacetimeDB server message, grouped by
 * table name. Each insert is a JSON string and is parsed here. Non-subscription
 * messages (e.g. IdentityToken) yield an empty map.
 */
export function extractTableInserts(message: ServerMessage): Map<string, RawRow[]> {
  const result = new Map<string, RawRow[]>();
  const tables = message.InitialSubscription?.database_update?.tables;
  if (!tables) return result;
  for (const table of tables) {
    const name = table.table_name;
    if (!name) continue;
    const rows: RawRow[] = result.get(name) ?? [];
    for (const update of table.updates ?? []) {
      for (const raw of update.inserts ?? []) {
        rows.push(JSON.parse(raw));
      }
    }
    result.set(name, rows);
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/shared/src/spacetime/subscription-message.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/spacetime/subscription-message.ts packages/shared/src/spacetime/subscription-message.test.ts
git commit -m "feat(shared): pure parser for SpacetimeDB subscription inserts"
```

---

## Task 3: Row normalizer + column orders (TDD)

The normalizer turns a raw insert into a keyed record. SpacetimeDB v1.json may encode a row as a positional array (ProductValue) or a keyed object; the normalizer handles both. Column orders come from the resolved schema.

**Files:**
- Create: `packages/shared/src/ingest/column-orders.ts`, `packages/shared/src/ingest/normalize-row.ts`, `packages/shared/src/ingest/normalize-row.test.ts`

- [ ] **Step 1: Create the column orders**

Create `packages/shared/src/ingest/column-orders.ts` (orders match the resolved schema; positional decoding relies on these):

```ts
/** Column order per source table, from the resolved RawModuleDefV9 schema. */
export const COLUMN_ORDERS: Record<string, string[]> = {
  item_desc: [
    "id", "name", "description", "volume", "durability", "convert_to_on_durability_zero",
    "secondary_knowledge_id", "model_asset_name", "icon_asset_name", "tier", "tag",
    "rarity", "compendium_entry", "item_list_id",
  ],
  cargo_desc: [
    "id", "name", "description", "volume", "secondary_knowledge_id", "model_asset_name",
    "icon_asset_name", "carried_model_asset_name", "pick_up_animation_start",
    "pick_up_animation_end", "drop_animation_start", "drop_animation_end", "pick_up_time",
    "place_time", "animator_state", "movement_modifier", "blocks_path",
    "on_destroy_yield_cargos", "despawn_time", "tier", "tag", "rarity", "not_pickupable",
  ],
  building_desc: [
    "id", "functions", "name", "description", "rested_buff_duration", "light_radius",
    "model_asset_name", "icon_asset_name", "unenterable", "wilderness", "footprint",
    "max_health", "ignore_damage", "defense_level", "decay", "maintenance",
    "build_permission", "interact_permission", "has_action", "show_in_compendium",
    "is_ruins", "not_deconstructible",
  ],
  crafting_recipe_desc: [
    "id", "name", "time_requirement", "stamina_requirement", "tool_durability_lost",
    "building_requirement", "level_requirements", "tool_requirements", "consumed_item_stacks",
    "discovery_triggers", "required_claim_tech_id", "full_discovery_score",
    "experience_per_progress", "crafted_item_stacks", "actions_required", "tool_mesh_index",
    "recipe_performance_id", "required_knowledges", "blocking_knowledges",
    "hide_without_required_knowledge", "hide_with_blocking_knowledges", "allow_use_hands",
    "is_passive",
  ],
  construction_recipe_desc: [
    "id", "name", "time_requirement", "stamina_requirement", "consumed_building",
    "required_interior_tier", "level_requirements", "tool_requirements", "consumed_item_stacks",
    "consumed_cargo_stacks", "consumed_shards", "experience_per_progress", "discovery_triggers",
    "required_knowledges", "required_claim_tech_id", "full_discovery_score", "tool_mesh_index",
    "building_description_id", "required_paving_tier", "actions_required", "instantly_built",
    "recipe_performance_id",
  ],
  food_desc: [
    "item_id", "hp", "up_to_hp", "stamina", "up_to_stamina", "hunger",
    "teleportation_energy", "consumable_while_in_combat", "buffs",
  ],
  equipment_desc: [
    "item_id", "slots", "visual_type", "level_requirement", "clothing_visual",
    "hand_equipment_visual", "stats", "required_achievements", "required_knowledges",
  ],
};
```

- [ ] **Step 2: Write the failing test**

Create `packages/shared/src/ingest/normalize-row.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeRow } from "./normalize-row";

describe("normalizeRow", () => {
  it("zips a positional array with the column order", () => {
    const cols = ["id", "name", "tier"];
    expect(normalizeRow(cols, [5, "Iron", 3])).toEqual({ id: 5, name: "Iron", tier: 3 });
  });

  it("passes through an already-keyed object", () => {
    const cols = ["id", "name"];
    expect(normalizeRow(cols, { id: 1, name: "Stone" })).toEqual({ id: 1, name: "Stone" });
  });

  it("fills missing trailing array fields with undefined", () => {
    const cols = ["id", "name", "tier"];
    expect(normalizeRow(cols, [5, "Iron"])).toEqual({ id: 5, name: "Iron", tier: undefined });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/ingest/normalize-row.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `packages/shared/src/ingest/normalize-row.ts`:

```ts
/**
 * Normalize a raw SpacetimeDB insert into a keyed record. Handles both the
 * positional-array encoding (zipped against the given column order) and the
 * already-keyed-object encoding.
 */
export function normalizeRow(columnOrder: string[], raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    columnOrder.forEach((col, i) => {
      out[col] = raw[i];
    });
    return out;
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  throw new Error(`Cannot normalize row of type ${typeof raw}`);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run packages/shared/src/ingest/normalize-row.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ingest/column-orders.ts packages/shared/src/ingest/normalize-row.ts packages/shared/src/ingest/normalize-row.test.ts
git commit -m "feat(shared): row normalizer + source column orders"
```

---

## Task 4: Decoders + slugify (TDD)

**Files:**
- Create: `packages/shared/src/ingest/decode.ts`, `packages/shared/src/ingest/decode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/ingest/decode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decodeRarity, toInt, slugify, RARITIES } from "./decode";

describe("decodeRarity", () => {
  it("decodes a numeric index", () => {
    expect(decodeRarity(0)).toBe("Default");
    expect(decodeRarity(5)).toBe("Legendary");
  });
  it("decodes a string name", () => {
    expect(decodeRarity("Rare")).toBe("Rare");
  });
  it("decodes a tagged object {VariantName: ...}", () => {
    expect(decodeRarity({ Epic: [] })).toBe("Epic");
  });
  it("decodes a tagged object with numeric tag {\"3\": ...}", () => {
    expect(decodeRarity({ "3": [] })).toBe("Rare");
  });
  it("falls back to Default on unknown", () => {
    expect(decodeRarity(null)).toBe("Default");
  });
});

describe("toInt", () => {
  it("coerces numbers and numeric strings", () => {
    expect(toInt(5)).toBe(5);
    expect(toInt("7")).toBe(7);
    expect(toInt(undefined)).toBe(null);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Iron Ingot")).toBe("iron-ingot");
    expect(slugify("Tier 3 Axe!")).toBe("tier-3-axe");
  });
});

describe("RARITIES", () => {
  it("is the canonical ordered list", () => {
    expect(RARITIES).toEqual(["Default", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/ingest/decode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/ingest/decode.ts`:

```ts
export const RARITIES = ["Default", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Decode a SpacetimeDB rarity value (index, name, or tagged sum) to a Rarity. */
export function decodeRarity(value: unknown): Rarity {
  if (typeof value === "number" && RARITIES[value]) return RARITIES[value];
  if (typeof value === "string" && (RARITIES as readonly string[]).includes(value)) return value as Rarity;
  if (value && typeof value === "object") {
    const key = Object.keys(value as object)[0];
    if (key !== undefined) {
      const asNum = Number(key);
      if (Number.isInteger(asNum) && RARITIES[asNum]) return RARITIES[asNum];
      if ((RARITIES as readonly string[]).includes(key)) return key as Rarity;
    }
  }
  return "Default";
}

/** Coerce a value to an integer, or null if not coercible. */
export function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.trunc(Number(value));
  return null;
}

/** URL slug from a display name (does not de-duplicate; see makeUniqueSlug). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/shared/src/ingest/decode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ingest/decode.ts packages/shared/src/ingest/decode.test.ts
git commit -m "feat(shared): rarity/int decoders and slugify"
```

---

## Task 5: Drizzle schema for compendium entities

**Files:** Modify `packages/shared/src/db/schema.ts`

- [ ] **Step 1: Append the new tables**

Add to `packages/shared/src/db/schema.ts` (keep existing `ingestionRuns`/`rawSnapshots`):

```ts
import { pgTable, integer, text, boolean, real, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

export const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    tier: integer("tier"),
    rarity: text("rarity").notNull().default("Default"),
    tag: text("tag"),
    volume: integer("volume"),
    durability: integer("durability"),
    iconAssetName: text("icon_asset_name"),
    compendiumEntry: boolean("compendium_entry").default(true).notNull(),
    raw: jsonb("raw").notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("items_slug_idx").on(t.slug),
    tierIdx: index("items_tier_idx").on(t.tier),
    rarityIdx: index("items_rarity_idx").on(t.rarity),
    tagIdx: index("items_tag_idx").on(t.tag),
  }),
);

export const itemFood = pgTable("item_food", {
  itemId: integer("item_id").primaryKey().references(() => items.id),
  hp: real("hp"),
  stamina: real("stamina"),
  hunger: real("hunger"),
  teleportationEnergy: real("teleportation_energy"),
  raw: jsonb("raw").notNull(),
});

export const itemEquipment = pgTable("item_equipment", {
  itemId: integer("item_id").primaryKey().references(() => items.id),
  slots: jsonb("slots"),
  stats: jsonb("stats"),
  raw: jsonb("raw").notNull(),
});

export const cargo = pgTable(
  "cargo",
  {
    id: integer("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    tier: integer("tier"),
    rarity: text("rarity").notNull().default("Default"),
    tag: text("tag"),
    volume: integer("volume"),
    iconAssetName: text("icon_asset_name"),
    raw: jsonb("raw").notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("cargo_slug_idx").on(t.slug),
    tierIdx: index("cargo_tier_idx").on(t.tier),
    rarityIdx: index("cargo_rarity_idx").on(t.rarity),
  }),
);

export const buildings = pgTable(
  "buildings",
  {
    id: integer("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    functions: jsonb("functions"),
    iconAssetName: text("icon_asset_name"),
    showInCompendium: boolean("show_in_compendium").default(true).notNull(),
    raw: jsonb("raw").notNull(),
  },
  (t) => ({ slugIdx: uniqueIndex("buildings_slug_idx").on(t.slug) }),
);

export const recipes = pgTable(
  "recipes",
  {
    id: integer("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // "crafting" | "construction"
    timeRequirement: real("time_requirement"),
    staminaRequirement: real("stamina_requirement"),
    raw: jsonb("raw").notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("recipes_slug_idx").on(t.slug),
    typeIdx: index("recipes_type_idx").on(t.type),
  }),
);

export const recipeInputs = pgTable(
  "recipe_inputs",
  {
    recipeId: integer("recipe_id").notNull().references(() => recipes.id),
    refType: text("ref_type").notNull(), // "item" | "cargo"
    refId: integer("ref_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => ({
    byRecipe: index("recipe_inputs_recipe_idx").on(t.recipeId),
    byRef: index("recipe_inputs_ref_idx").on(t.refType, t.refId),
  }),
);

export const recipeOutputs = pgTable(
  "recipe_outputs",
  {
    recipeId: integer("recipe_id").notNull().references(() => recipes.id),
    refType: text("ref_type").notNull(),
    refId: integer("ref_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => ({
    byRecipe: index("recipe_outputs_recipe_idx").on(t.recipeId),
    byRef: index("recipe_outputs_ref_idx").on(t.refType, t.refId),
  }),
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: PASS.

- [ ] **Step 3: Generate the migration (offline)**

Run: `pnpm --filter @bcc/shared db:generate`
Expected: a new SQL migration appears under `packages/shared/drizzle/`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle
git commit -m "feat(shared): Drizzle schema for items/cargo/buildings/recipes + craft graph"
```

---

## Task 6: Entity mappers — items/cargo/buildings (TDD)

**Files:**
- Create: `packages/shared/src/ingest/map-entities.ts`, `packages/shared/src/ingest/map-entities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/ingest/map-entities.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapItemRow, mapCargoRow, mapBuildingRow } from "./map-entities";

describe("mapItemRow", () => {
  it("maps a normalized item row to a DB insert", () => {
    const raw = {
      id: 10, name: "Iron Ingot", description: "A bar.", volume: 100, durability: 0,
      icon_asset_name: "Icons/iron", tier: 3, tag: "Metal", rarity: 2, compendium_entry: true,
    };
    expect(mapItemRow(raw, "iron-ingot")).toEqual({
      id: 10, slug: "iron-ingot", name: "Iron Ingot", description: "A bar.", tier: 3,
      rarity: "Uncommon", tag: "Metal", volume: 100, durability: 0,
      iconAssetName: "Icons/iron", compendiumEntry: true, raw,
    });
  });

  it("defaults description and compendiumEntry when missing", () => {
    const raw = { id: 1, name: "X", rarity: 0 };
    const out = mapItemRow(raw, "x");
    expect(out.description).toBe("");
    expect(out.compendiumEntry).toBe(true);
  });
});

describe("mapCargoRow", () => {
  it("maps a normalized cargo row", () => {
    const raw = { id: 5, name: "Log", description: "", volume: 600, tier: 1, tag: "Wood", rarity: 1, icon_asset_name: "Icons/log" };
    expect(mapCargoRow(raw, "log")).toMatchObject({ id: 5, slug: "log", name: "Log", tier: 1, rarity: "Common", tag: "Wood" });
  });
});

describe("mapBuildingRow", () => {
  it("maps a normalized building row", () => {
    const raw = { id: 7, name: "Kiln", description: "Smelts.", show_in_compendium: true, functions: [{ a: 1 }] };
    const out = mapBuildingRow(raw, "kiln");
    expect(out).toMatchObject({ id: 7, slug: "kiln", name: "Kiln", showInCompendium: true });
    expect(out.functions).toEqual([{ a: 1 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/ingest/map-entities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/ingest/map-entities.ts`:

```ts
import { decodeRarity, toInt } from "./decode";
import type { NewItem } from "../db/schema";

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export function mapItemRow(raw: Raw, slug: string): NewItem {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    description: str(raw.description),
    tier: toInt(raw.tier),
    rarity: decodeRarity(raw.rarity),
    tag: raw.tag == null ? null : str(raw.tag),
    volume: toInt(raw.volume),
    durability: toInt(raw.durability),
    iconAssetName: raw.icon_asset_name == null ? null : str(raw.icon_asset_name),
    compendiumEntry: raw.compendium_entry === undefined ? true : Boolean(raw.compendium_entry),
    raw,
  };
}

export function mapCargoRow(raw: Raw, slug: string) {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    description: str(raw.description),
    tier: toInt(raw.tier),
    rarity: decodeRarity(raw.rarity),
    tag: raw.tag == null ? null : str(raw.tag),
    volume: toInt(raw.volume),
    iconAssetName: raw.icon_asset_name == null ? null : str(raw.icon_asset_name),
    raw,
  };
}

export function mapBuildingRow(raw: Raw, slug: string) {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    description: str(raw.description),
    functions: (raw.functions ?? null) as unknown,
    iconAssetName: raw.icon_asset_name == null ? null : str(raw.icon_asset_name),
    showInCompendium: raw.show_in_compendium === undefined ? true : Boolean(raw.show_in_compendium),
    raw,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/shared/src/ingest/map-entities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ingest/map-entities.ts packages/shared/src/ingest/map-entities.test.ts
git commit -m "feat(shared): item/cargo/building row mappers"
```

---

## Task 7: Recipe mapper + craft-graph builder (TDD)

Recipe ingredient/output stacks look like `{item_id, quantity, item_type}` where `item_type` distinguishes item vs cargo. `item_type` is a tagged sum; we detect "cargo" by variant name/string containing "cargo" (case-insensitive), else default to "item".

**Files:**
- Create: `packages/shared/src/ingest/map-recipes.ts`, `packages/shared/src/ingest/map-recipes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/ingest/map-recipes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapRecipeRow, buildRecipeGraph, refTypeOf } from "./map-recipes";

describe("refTypeOf", () => {
  it("detects cargo from a tagged sum and defaults to item", () => {
    expect(refTypeOf({ Cargo: [] })).toBe("cargo");
    expect(refTypeOf("Item")).toBe("item");
    expect(refTypeOf({ Item: [] })).toBe("item");
    expect(refTypeOf(undefined)).toBe("item");
  });
});

describe("mapRecipeRow", () => {
  it("maps a crafting recipe header", () => {
    const raw = { id: 3, name: "Smelt Iron", time_requirement: 5, stamina_requirement: 1 };
    expect(mapRecipeRow(raw, "crafting", "smelt-iron")).toEqual({
      id: 3, slug: "smelt-iron", name: "Smelt Iron", type: "crafting",
      timeRequirement: 5, staminaRequirement: 1, raw,
    });
  });
});

describe("buildRecipeGraph", () => {
  it("produces input and output rows from stacks", () => {
    const raw = {
      consumed_item_stacks: [{ item_id: 1, quantity: 2, item_type: { Item: [] } }],
      crafted_item_stacks: [{ item_id: 9, quantity: 1, item_type: { Cargo: [] } }],
    };
    const { inputs, outputs } = buildRecipeGraph(3, raw);
    expect(inputs).toEqual([{ recipeId: 3, refType: "item", refId: 1, quantity: 2 }]);
    expect(outputs).toEqual([{ recipeId: 3, refType: "cargo", refId: 9, quantity: 1 }]);
  });

  it("also reads consumed_cargo_stacks (construction recipes)", () => {
    const raw = { consumed_cargo_stacks: [{ item_id: 4, quantity: 3 }] };
    const { inputs } = buildRecipeGraph(8, raw);
    expect(inputs).toContainEqual({ recipeId: 8, refType: "cargo", refId: 4, quantity: 3 });
  });

  it("returns empty arrays when no stacks present", () => {
    expect(buildRecipeGraph(1, {})).toEqual({ inputs: [], outputs: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/ingest/map-recipes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/ingest/map-recipes.ts`:

```ts
import { toInt } from "./decode";

type Raw = Record<string, unknown>;
export type RefType = "item" | "cargo";
export interface GraphRow { recipeId: number; refType: RefType; refId: number; quantity: number }

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Determine whether a stack references an item or cargo from its item_type sum. */
export function refTypeOf(itemType: unknown): RefType {
  if (typeof itemType === "string") return /cargo/i.test(itemType) ? "cargo" : "item";
  if (itemType && typeof itemType === "object") {
    const key = Object.keys(itemType as object)[0] ?? "";
    return /cargo/i.test(key) ? "cargo" : "item";
  }
  return "item";
}

export function mapRecipeRow(raw: Raw, type: "crafting" | "construction", slug: string) {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    type,
    timeRequirement: typeof raw.time_requirement === "number" ? raw.time_requirement : null,
    staminaRequirement: typeof raw.stamina_requirement === "number" ? raw.stamina_requirement : null,
    raw,
  };
}

function stacksToRows(recipeId: number, stacks: unknown, forceType?: RefType): GraphRow[] {
  if (!Array.isArray(stacks)) return [];
  const rows: GraphRow[] = [];
  for (const s of stacks) {
    if (!s || typeof s !== "object") continue;
    const stack = s as Raw;
    const refId = toInt(stack.item_id);
    if (refId == null) continue;
    rows.push({
      recipeId,
      refType: forceType ?? refTypeOf(stack.item_type),
      refId,
      quantity: toInt(stack.quantity) ?? 1,
    });
  }
  return rows;
}

/** Build recipe_inputs/recipe_outputs rows from a recipe's consumed/crafted stacks. */
export function buildRecipeGraph(recipeId: number, raw: Raw): { inputs: GraphRow[]; outputs: GraphRow[] } {
  const inputs = [
    ...stacksToRows(recipeId, raw.consumed_item_stacks),
    ...stacksToRows(recipeId, raw.consumed_cargo_stacks, "cargo"),
  ];
  const outputs = stacksToRows(recipeId, raw.crafted_item_stacks);
  return { inputs, outputs };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/shared/src/ingest/map-recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ingest/map-recipes.ts packages/shared/src/ingest/map-recipes.test.ts
git commit -m "feat(shared): recipe mapper and craft-graph builder"
```

---

## Task 8: Unique-slug helper + shared barrel exports (TDD)

**Files:**
- Create: `packages/shared/src/ingest/unique-slug.ts`, `packages/shared/src/ingest/unique-slug.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/ingest/unique-slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeUniqueSlug } from "./unique-slug";

describe("makeUniqueSlug", () => {
  it("returns the base slug when unused", () => {
    const used = new Set<string>();
    expect(makeUniqueSlug("Iron Ingot", 10, used)).toBe("iron-ingot");
    expect(used.has("iron-ingot")).toBe(true);
  });
  it("appends the id on collision", () => {
    const used = new Set<string>(["iron-ingot"]);
    expect(makeUniqueSlug("Iron Ingot", 42, used)).toBe("iron-ingot-42");
  });
  it("uses the id when the name slugifies to empty", () => {
    const used = new Set<string>();
    expect(makeUniqueSlug("!!!", 7, used)).toBe("7");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/shared/src/ingest/unique-slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/ingest/unique-slug.ts`:

```ts
import { slugify } from "./decode";

/** Produce a unique slug for a name, recording it in `used`. Falls back to id. */
export function makeUniqueSlug(name: string, id: number, used: Set<string>): string {
  const base = slugify(name) || String(id);
  const slug = used.has(base) ? `${base}-${id}` : base;
  used.add(slug);
  return slug;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/shared/src/ingest/unique-slug.test.ts`
Expected: PASS.

- [ ] **Step 5: Export the new modules from the barrel**

Add to `packages/shared/src/index.ts`:

```ts
export { extractTableInserts } from "./spacetime/subscription-message";
export type { RawRow } from "./spacetime/subscription-message";
export { COLUMN_ORDERS } from "./ingest/column-orders";
export { normalizeRow } from "./ingest/normalize-row";
export { decodeRarity, toInt, slugify, RARITIES } from "./ingest/decode";
export type { Rarity } from "./ingest/decode";
export { mapItemRow, mapCargoRow, mapBuildingRow } from "./ingest/map-entities";
export { mapRecipeRow, buildRecipeGraph, refTypeOf } from "./ingest/map-recipes";
export type { RefType, GraphRow } from "./ingest/map-recipes";
export { makeUniqueSlug } from "./ingest/unique-slug";
```

- [ ] **Step 6: Typecheck + full shared tests**

Run: `pnpm --filter @bcc/shared typecheck && pnpm vitest run packages/shared`
Expected: PASS (all shared tests green).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ingest/unique-slug.ts packages/shared/src/ingest/unique-slug.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): unique-slug helper and ingest barrel exports"
```

---

## Task 9: WebSocket snapshot transport (worker)

The thin transport. Hard to unit-test without a live server, so it is intentionally minimal; its parsing is already covered by Task 2.

**Files:** Create `apps/worker/src/spacetime/ws-snapshot.ts`

- [ ] **Step 1: Implement**

Create `apps/worker/src/spacetime/ws-snapshot.ts`:

```ts
import WebSocket from "ws";
import { extractTableInserts, type RawRow } from "@bcc/shared";

export interface SnapshotConfig {
  uri: string; // wss://host
  moduleName: string;
  token: string;
}

/**
 * Read-only one-shot snapshot: open a v1.json WebSocket, subscribe to the given
 * SQL queries, collect the InitialSubscription rows, then close. Never sends a
 * reducer call. Resolves to rows grouped by source table name.
 */
export function readSnapshot(
  config: SnapshotConfig,
  queries: string[],
  timeoutMs = 60_000,
): Promise<Map<string, RawRow[]>> {
  const url = `${config.uri.replace(/\/+$/, "")}/v1/database/${config.moduleName}/subscribe`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, ["v1.json.spacetimedb"], {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Snapshot timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({ Subscribe: { query_strings: queries, request_id: 1 } }));
    });
    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // ignore non-JSON frames
      }
      const tables = extractTableInserts(msg as object);
      if (tables.size > 0) {
        clearTimeout(timer);
        ws.close();
        resolve(tables);
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket upgrade rejected: ${res.statusCode} ${res.statusMessage}`));
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/spacetime/ws-snapshot.ts
git commit -m "feat(worker): read-only WebSocket snapshot transport"
```

---

## Task 10: Snapshot orchestrator command (worker)

**Files:**
- Create: `apps/worker/src/snapshot.ts`
- Modify: `apps/worker/package.json` (add `snapshot` script)

- [ ] **Step 1: Implement the orchestrator**

Create `apps/worker/src/snapshot.ts`:

```ts
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import {
  parseServerEnv, createDb, schema, COLUMN_ORDERS, normalizeRow,
  mapItemRow, mapCargoRow, mapBuildingRow, mapRecipeRow, buildRecipeGraph, makeUniqueSlug,
} from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";

const QUERIES = [
  "SELECT * FROM item_desc",
  "SELECT * FROM cargo_desc",
  "SELECT * FROM building_desc",
  "SELECT * FROM crafting_recipe_desc",
  "SELECT * FROM construction_recipe_desc",
];

async function main() {
  const env = parseServerEnv();
  if (env.INGESTION_ENABLED !== true) {
    console.warn("[snapshot] INGESTION_ENABLED=false — kill switch active, exiting.");
    process.exit(0);
  }
  const db = createDb(env.DATABASE_URL);
  const [run] = await db.insert(schema.ingestionRuns).values({ status: "running" }).returning();

  try {
    const tables = await readSnapshot(
      { uri: env.SPACETIME_URI, moduleName: env.SPACETIME_MODULE, token: env.SPACETIME_TOKEN },
      QUERIES,
    );
    const norm = (t: string) => (tables.get(t) ?? []).map((r) => normalizeRow(COLUMN_ORDERS[t]!, r));

    // Items (+ unique slugs)
    const itemSlugs = new Set<string>();
    const itemRows = norm("item_desc").map((r) => mapItemRow(r, makeUniqueSlug(String(r.name ?? r.id), Number(r.id), itemSlugs)));

    const cargoSlugs = new Set<string>();
    const cargoRows = norm("cargo_desc").map((r) => mapCargoRow(r, makeUniqueSlug(String(r.name ?? r.id), Number(r.id), cargoSlugs)));

    const buildingSlugs = new Set<string>();
    const buildingRows = norm("building_desc").map((r) => mapBuildingRow(r, makeUniqueSlug(String(r.name ?? r.id), Number(r.id), buildingSlugs)));

    const recipeSlugs = new Set<string>();
    const craftRaw = norm("crafting_recipe_desc");
    const constructRaw = norm("construction_recipe_desc");
    const recipeRows = [
      ...craftRaw.map((r) => mapRecipeRow(r, "crafting", makeUniqueSlug(String(r.name ?? r.id), Number(r.id), recipeSlugs))),
      ...constructRaw.map((r) => mapRecipeRow(r, "construction", makeUniqueSlug(String(r.name ?? r.id), Number(r.id), recipeSlugs))),
    ];
    const graph = [...craftRaw, ...constructRaw].map((r) => buildRecipeGraph(Number(r.id), r));
    const inputs = graph.flatMap((g) => g.inputs);
    const outputs = graph.flatMap((g) => g.outputs);

    // Idempotent load: replace child tables, upsert entities.
    await db.transaction(async (tx) => {
      await tx.delete(schema.recipeInputs);
      await tx.delete(schema.recipeOutputs);
      if (itemRows.length) await tx.insert(schema.items).values(itemRows).onConflictDoUpdate({ target: schema.items.id, set: conflictUpdateSet(schema.items) });
      if (cargoRows.length) await tx.insert(schema.cargo).values(cargoRows).onConflictDoUpdate({ target: schema.cargo.id, set: conflictUpdateSet(schema.cargo) });
      if (buildingRows.length) await tx.insert(schema.buildings).values(buildingRows).onConflictDoUpdate({ target: schema.buildings.id, set: conflictUpdateSet(schema.buildings) });
      if (recipeRows.length) await tx.insert(schema.recipes).values(recipeRows).onConflictDoUpdate({ target: schema.recipes.id, set: conflictUpdateSet(schema.recipes) });
      if (inputs.length) await tx.insert(schema.recipeInputs).values(inputs);
      if (outputs.length) await tx.insert(schema.recipeOutputs).values(outputs);
    });

    const total = itemRows.length + cargoRows.length + buildingRows.length + recipeRows.length;
    await db.update(schema.ingestionRuns).set({ status: "ok", finishedAt: new Date(), rowsUpserted: total }).where(eqRun(run!.id));
    console.log(`[snapshot] OK — items=${itemRows.length} cargo=${cargoRows.length} buildings=${buildingRows.length} recipes=${recipeRows.length}`);
    process.exit(0);
  } catch (err) {
    await db.update(schema.ingestionRuns).set({ status: "error", finishedAt: new Date(), error: String(err) }).where(eqRun(run!.id));
    console.error("[snapshot] FAILED:", err);
    process.exit(1);
  }
}

// Local helpers (kept here to avoid premature shared API).
import { eq, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";

function eqRun(id: string) {
  return eq(schema.ingestionRuns.id, id);
}

/**
 * On conflict, set every non-`id` column to its incoming (`excluded`) value.
 * Uses Drizzle's getTableColumns to read each column's DB name.
 */
function conflictUpdateSet(table: Parameters<typeof getTableColumns>[0]): Record<string, unknown> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (key === "id") continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

main().catch((e) => { console.error("[snapshot] fatal:", e); process.exit(1); });
```

> **Note for the implementer:** verify `conflictUpdateSet` against the installed Drizzle version — `getTableColumns(table)` returns columns keyed by JS property with a `.name` (DB column) field; the helper sets each non-`id` column to `excluded."<dbName>"`. Confirm `onConflictDoUpdate({ target, set })` accepts a `Record<string, SQL>` for postgres-js (it does in current Drizzle). If `tx`'s type makes the generic `table` param awkward, type it as `PgTable` from `drizzle-orm/pg-core`. Ensure `mapBuildingRow`'s `functions` value satisfies the `jsonb` column type (cast if needed).

- [ ] **Step 2: Add the `snapshot` script**

In `apps/worker/package.json` scripts, add: `"snapshot": "tsx src/snapshot.ts"`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS (fix the conflict-set helper until it does).

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/snapshot.ts apps/worker/package.json
git commit -m "feat(worker): compendium snapshot orchestrator (read -> map -> upsert -> audit)"
```

---

## Task 11: Apply schema + run the live snapshot (manual verification)

Requires real `.env.local` (DATABASE_URL + SPACETIME_URI/MODULE/TOKEN). This validates the token and confirms the real row encoding.

- [ ] **Step 1: Apply the new schema to Postgres**

Run: `pnpm --filter @bcc/shared db:push`
Expected: the new tables are created in Postgres.

- [ ] **Step 2: Capture a raw sample first (confirm encoding)**

Run: `pnpm --filter @bcc/worker probe` (already prints connectivity) — then run the snapshot:
Run: `pnpm --filter @bcc/worker snapshot`
Expected: logs `[snapshot] OK — items=… cargo=… buildings=… recipes=…` with non-zero counts.

**If counts are zero or values look wrong** (e.g., names land in the wrong columns), the row encoding differs from the assumption. Inspect a raw row by temporarily logging `tables.get("item_desc")?.[0]` in `snapshot.ts`:
- If rows are **positional arrays**, `normalizeRow` zips them with `COLUMN_ORDERS` — verify the order matches the live schema (regenerate via `pnpm --filter @bcc/worker probe` and compare `docs/reference/bitcraft-schema.json`).
- If rows are **keyed objects**, `normalizeRow` passes them through — confirm the keys match the field names used in the mappers.
- If `rarity`/enums are encoded unexpectedly, confirm `decodeRarity` handles the observed form (index/string/tagged); extend its test + code if a new form appears.

- [ ] **Step 3: Spot-check the data**

Run a quick query (psql or a Neon SQL console):
```sql
SELECT count(*) FROM items;
SELECT id, slug, name, tier, rarity FROM items ORDER BY id LIMIT 5;
SELECT count(*) FROM recipe_inputs;
SELECT count(*) FROM recipe_outputs;
```
Expected: items/cargo/buildings/recipes populated; recipe_inputs/outputs non-empty; slugs look sensible; rarity values are within the canonical set.

- [ ] **Step 4: Confirm idempotency**

Run: `pnpm --filter @bcc/worker snapshot` a second time.
Expected: succeeds again; row counts stable (no duplicates).

- [ ] **Step 5: Record the result**

Append a one-line "Phase 1a snapshot confirmed YYYY-MM-DD — items=N cargo=N buildings=N recipes=N; row encoding = array|object" note to the Phase 1 spec §3, and commit that doc change (no secrets):

```bash
git add docs/superpowers/specs/2026-06-04-bitcraft-companion-phase-1-compendium-design.md
git commit -m "docs: record Phase 1a snapshot results and observed row encoding"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: all tests pass (Phase 0 + the new shared ingest tests).

- [ ] **Step 2: Typecheck + build everything**

Run: `pnpm typecheck && pnpm build`
Expected: PASS across `@bcc/shared`, `@bcc/worker`, `@bcc/web`.

- [ ] **Step 3: Security check**

Run: `git ls-files | grep -i "\.env"` → expect only `.env.example`. Confirm no token/connection-string in any tracked file.

- [ ] **Step 4: Commit any remaining fixes** (if needed), otherwise done.

---

## Self-Review (completed by plan author)

**Spec coverage (spec → task):**
- §2 four entity types (items+food/equipment folded, cargo, buildings, recipes) → schema Task 5; mappers Tasks 6–7; ingestion Task 10. *(Note: `item_food`/`item_equipment` tables exist in the schema (Task 5); populating them is deferred to Phase 1b alongside item detail pages, since the page work defines exactly which food/equipment fields surface — flagged below.)*
- §3 data path: raw v1.json WS reader, snapshot model, idempotent upsert, audit row, kill switch, token validation → Tasks 2, 9, 10, 11 ✅
- §4 data model (items/cargo/buildings/recipes + recipe_inputs/outputs, slug, raw, indexes) → Task 5 ✅
- §6 search indexes — filter-column indexes added in Task 5; the `tsvector`/GIN full-text index + `/api/search` are **Phase 1b** (query/UI concern) — intentionally deferred to plan 1b ✅
- §7 slugs (slugify + collision) → Tasks 4, 8 ✅; icons stored not rendered → schema keeps `icon_asset_name` (Task 5) ✅; testing → fixture tests throughout ✅

**Deferred to Phase 1b (web/search/SEO plan):** all `apps/web` pages (hub, browse, detail), JSON-LD/metadata/sitemap, Postgres FTS `search_vector` + GIN index + `/api/search`, search/filter UI, and populating `item_food`/`item_equipment` for item detail pages. These depend on the confirmed data from Task 11.

**Placeholder scan:** the only soft spot is the `conflictSet`/`buildConflictSet` helper in Task 10, which is explicitly called out with the required clean form and the exact intended behavior (set non-`id` columns to `excluded.*`). Everything else is complete code.

**Type consistency:** `extractTableInserts`/`RawRow`, `normalizeRow`/`COLUMN_ORDERS`, `decodeRarity`/`toInt`/`slugify`/`RARITIES`, `mapItemRow`/`mapCargoRow`/`mapBuildingRow`, `mapRecipeRow`/`buildRecipeGraph`/`refTypeOf`/`GraphRow`, `makeUniqueSlug` are defined once and reused consistently; schema table names (`items`, `cargo`, `buildings`, `recipes`, `recipeInputs`, `recipeOutputs`, `itemFood`, `itemEquipment`) match across schema, barrel, and orchestrator.
```
