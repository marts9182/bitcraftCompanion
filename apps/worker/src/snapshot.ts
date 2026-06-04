import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import {
  parseServerEnv, createDb, schema, COLUMN_ORDERS, normalizeRow,
  mapItemRow, mapCargoRow, mapBuildingRow, mapRecipeRow, buildRecipeGraph, makeUniqueSlug,
} from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";
import { eq, sql, getTableColumns, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

const QUERIES = [
  "SELECT * FROM item_desc",
  "SELECT * FROM cargo_desc",
  "SELECT * FROM building_desc",
  "SELECT * FROM crafting_recipe_desc",
  "SELECT * FROM construction_recipe_desc",
];

const EXPECTED_TABLES = [
  "item_desc", "cargo_desc", "building_desc", "crafting_recipe_desc", "construction_recipe_desc",
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
      EXPECTED_TABLES,
    );
    for (const t of EXPECTED_TABLES) console.log(`[snapshot] ${t}: ${(tables.get(t) ?? []).length} rows`);
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
function eqRun(id: string) {
  return eq(schema.ingestionRuns.id, id);
}

/**
 * On conflict, set every non-`id` column to its incoming (`excluded`) value.
 * Uses Drizzle's getTableColumns to read each column's DB name.
 */
function conflictUpdateSet(table: PgTable): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (key === "id") continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

main().catch((e) => { console.error("[snapshot] fatal:", e); process.exit(1); });
