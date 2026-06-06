import { pgTable, uuid, text, timestamp, integer, bigint, jsonb, boolean, real, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";

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

export const regions = pgTable("regions", {
  region: text("region").primaryKey(),
  module: text("module").notNull(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const players = pgTable(
  "players",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    username: text("username").notNull(),
    timePlayed: integer("time_played").notNull().default(0),
    signedIn: boolean("signed_in").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byRegion: index("players_region_idx").on(t.region),
    byName: index("players_username_idx").on(t.username),
  }),
);

export const skills = pgTable("skills", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  maxLevel: integer("max_level").notNull().default(0),
});

export const playerSkills = pgTable(
  "player_skills",
  {
    playerEntityId: text("player_entity_id").notNull(),
    skillId: integer("skill_id").notNull(),
    region: text("region").notNull(),
    xp: bigint("xp", { mode: "number" }).notNull().default(0),
    level: integer("level").notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.playerEntityId, t.skillId] }),
    bySkill: index("player_skills_rank_idx").on(t.region, t.skillId, t.xp),
    byPlayer: index("player_skills_player_idx").on(t.playerEntityId),
  }),
);

export const empires = pgTable(
  "empires",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    name: text("name").notNull(),
    color: text("color"),
    numClaims: integer("num_claims").notNull().default(0),
    treasury: bigint("treasury", { mode: "number" }).notNull().default(0),
    leaderPlayerEntityId: text("leader_player_entity_id"),
    memberCount: integer("member_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ byRegion: index("empires_region_idx").on(t.region) }),
);

export const empireMembers = pgTable(
  "empire_members",
  {
    empireEntityId: text("empire_entity_id").notNull(),
    playerEntityId: text("player_entity_id").notNull(),
    region: text("region").notNull(),
    rank: integer("rank").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.empireEntityId, t.playerEntityId] }),
    byEmpire: index("empire_members_empire_idx").on(t.empireEntityId),
    byPlayer: index("empire_members_player_idx").on(t.playerEntityId),
  }),
);

export const claims = pgTable(
  "claims",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    name: text("name").notNull(),
    ownerPlayerEntityId: text("owner_player_entity_id"),
  },
  (t) => ({
    byRegion: index("claims_region_idx").on(t.region),
    byOwner: index("claims_owner_idx").on(t.ownerPlayerEntityId),
  }),
);

export const mapRegions = pgTable("map_regions", {
  id: integer("id").primaryKey(),
  name: text("name"),
  minChunkX: integer("min_chunk_x").notNull(),
  minChunkZ: integer("min_chunk_z").notNull(),
  widthChunks: integer("width_chunks").notNull(),
  heightChunks: integer("height_chunks").notNull(),
  regionIndex: integer("region_index").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mapClaims = pgTable(
  "map_claims",
  {
    entityId: text("entity_id").primaryKey(),
    name: text("name").notNull(),
    x: integer("x").notNull(),
    z: integer("z").notNull(),
    dimension: integer("dimension").notNull().default(1),
    numTiles: integer("num_tiles").notNull().default(0),
    treasury: bigint("treasury", { mode: "number" }).notNull().default(0),
    supplies: integer("supplies").notNull().default(0),
  },
  (t) => ({ byXz: index("map_claims_xz_idx").on(t.x, t.z) }),
);

export const mapChunks = pgTable(
  "map_chunks",
  {
    chunkIndex: text("chunk_index").primaryKey(),
    empireEntityId: text("empire_entity_id").notNull(),
    watchtowerEntityId: text("watchtower_entity_id"),
  },
  (t) => ({ byEmpire: index("map_chunks_empire_idx").on(t.empireEntityId) }),
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
