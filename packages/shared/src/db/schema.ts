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
    timeSignedIn: integer("time_signed_in").notNull().default(0),
    signInTimestamp: bigint("sign_in_timestamp", { mode: "number" }).notNull().default(0),
    signedIn: boolean("signed_in").notNull().default(false),
    // Materialized skill totals (sum across player_skills) so the players list can
    // sort/rank on an indexed column instead of aggregating 625k rows per request.
    totalLevel: integer("total_level").notNull().default(0),
    totalXp: bigint("total_xp", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byRegion: index("players_region_idx").on(t.region),
    byName: index("players_username_idx").on(t.username),
    byLevel: index("players_total_level_idx").on(t.totalLevel),
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
    currencyTreasury: bigint("currency_treasury", { mode: "number" }).notNull().default(0),
    nobilityThreshold: bigint("nobility_threshold", { mode: "number" }).notNull().default(0),
    ownerType: integer("owner_type"),
    towerCount: integer("tower_count").notNull().default(0),
    towerEnergy: bigint("tower_energy", { mode: "number" }).notNull().default(0),
    towerUpkeep: bigint("tower_upkeep", { mode: "number" }).notNull().default(0),
    // Empire Foundry (empire_foundry_state, global module): Hexite Capsules crafted
    // and waiting to collect, plus currently-crafting (queued), summed across foundries.
    foundryCapsules: bigint("foundry_capsules", { mode: "number" }).notNull().default(0),
    foundryQueued: bigint("foundry_queued", { mode: "number" }).notNull().default(0),
    // Hexite Capsules collected into the empire's Hexite Reserve building(s)
    // (inventory_state), summed across the empire's reserves in all regions.
    reserveCapsules: bigint("reserve_capsules", { mode: "number" }).notNull().default(0),
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
    noble: boolean("noble").notNull().default(false),
    donatedShards: bigint("donated_shards", { mode: "number" }).notNull().default(0),
    donatedCurrency: bigint("donated_currency", { mode: "number" }).notNull().default(0),
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

/** Empire towers/nodes (empire_node_state): one row per node with its energy/upkeep. */
export const empireTowers = pgTable(
  "empire_towers",
  {
    entityId: text("entity_id").primaryKey(),
    empireEntityId: text("empire_entity_id").notNull(),
    region: text("region").notNull(),
    chunkIndex: text("chunk_index").notNull(),
    energy: bigint("energy", { mode: "number" }).notNull().default(0),
    upkeep: bigint("upkeep", { mode: "number" }).notNull().default(0),
    active: boolean("active").notNull().default(false),
  },
  (t) => ({
    byEmpire: index("empire_towers_empire_idx").on(t.empireEntityId),
    byRegion: index("empire_towers_region_idx").on(t.region),
  }),
);

/** Player ↔ claim memberships (claim_member_state) with per-claim permission flags. */
export const claimMembers = pgTable(
  "claim_members",
  {
    claimEntityId: text("claim_entity_id").notNull(),
    playerEntityId: text("player_entity_id").notNull(),
    region: text("region").notNull(),
    claimName: text("claim_name").notNull().default(""),
    coOwner: boolean("co_owner").notNull().default(false),
    officer: boolean("officer").notNull().default(false),
    build: boolean("build").notNull().default(false),
    inventory: boolean("inventory").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.claimEntityId, t.playerEntityId] }),
    byPlayer: index("claim_members_player_idx").on(t.playerEntityId),
    byRegion: index("claim_members_region_idx").on(t.region),
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
