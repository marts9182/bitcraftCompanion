import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, real, uniqueIndex, index } from "drizzle-orm/pg-core";

/** Audit row written by the worker for each ingestion run. */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // "running" | "ok" | "error"
  rowsUpserted: integer("rows_upserted").default(0).notNull(),
  error: text("error"),
});

/** Generic raw payload storage keyed by source table + entity id (resilience / reprocessing). */
export const rawSnapshots = pgTable("raw_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceTable: text("source_table").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewRawSnapshot = typeof rawSnapshots.$inferInsert;

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
