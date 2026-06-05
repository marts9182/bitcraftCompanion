import "server-only";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { buildCraftGraph, type CraftGraph, type RefInfo, type StackRow } from "./craft-graph";
import { PAGE_SIZE, type ItemListParams } from "./item-list-params";

export type ItemRow = typeof schema.items.$inferSelect;

export interface ItemListResult {
  rows: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated, filtered item list. */
export async function listItems(params: ItemListParams): Promise<ItemListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.items.name, `%${params.q}%`));
  if (params.tier !== undefined) conds.push(eq(schema.items.tier, params.tier));
  if (params.rarity) conds.push(eq(schema.items.rarity, params.rarity));
  if (params.tag) conds.push(eq(schema.items.tag, params.tag));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.items)
    .where(where);

  const rows = await db
    .select()
    .from(schema.items)
    .where(where)
    .orderBy(schema.items.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);

  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getItemBySlug(slug: string): Promise<ItemRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.items).where(eq(schema.items.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllItemSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.items.slug }).from(schema.items);
  return rows.map((r) => r.slug);
}

/** Fetch + assemble the craft graph for an item id. */
export async function getItemCraftGraph(itemId: number): Promise<CraftGraph> {
  const db = getDb();
  const { recipeInputs, recipeOutputs, recipes, items, cargo } = schema;

  const madeByRows = await db
    .select({ recipeId: recipeOutputs.recipeId })
    .from(recipeOutputs)
    .where(and(eq(recipeOutputs.refType, "item"), eq(recipeOutputs.refId, itemId)));
  const usedInRows = await db
    .select({ recipeId: recipeInputs.recipeId })
    .from(recipeInputs)
    .where(and(eq(recipeInputs.refType, "item"), eq(recipeInputs.refId, itemId)));

  const madeByRecipeIds = [...new Set(madeByRows.map((r) => r.recipeId))];
  const usedInRecipeIds = [...new Set(usedInRows.map((r) => r.recipeId))];
  const allRecipeIds = [...new Set([...madeByRecipeIds, ...usedInRecipeIds])];
  if (allRecipeIds.length === 0) return { madeBy: [], usedIn: [] };

  const recipeRows = await db
    .select({ id: recipes.id, name: recipes.name, slug: recipes.slug, type: recipes.type })
    .from(recipes)
    .where(inArray(recipes.id, allRecipeIds));

  const inputRows = await db
    .select()
    .from(recipeInputs)
    .where(inArray(recipeInputs.recipeId, allRecipeIds));
  const outputRows = await db
    .select()
    .from(recipeOutputs)
    .where(inArray(recipeOutputs.recipeId, allRecipeIds));

  const stacks: StackRow[] = [
    ...inputRows.map((r) => ({
      recipeId: r.recipeId,
      direction: "input" as const,
      refType: r.refType as "item" | "cargo",
      refId: r.refId,
      quantity: r.quantity,
    })),
    ...outputRows.map((r) => ({
      recipeId: r.recipeId,
      direction: "output" as const,
      refType: r.refType as "item" | "cargo",
      refId: r.refId,
      quantity: r.quantity,
    })),
  ];

  // Resolve every referenced item/cargo to name + slug.
  const itemIds = [...new Set(stacks.filter((s) => s.refType === "item").map((s) => s.refId))];
  const cargoIds = [...new Set(stacks.filter((s) => s.refType === "cargo").map((s) => s.refId))];
  const refs: Record<string, RefInfo> = {};
  if (itemIds.length) {
    const r = await db
      .select({ id: items.id, name: items.name, slug: items.slug })
      .from(items)
      .where(inArray(items.id, itemIds));
    for (const x of r) refs[`item:${x.id}`] = { name: x.name, slug: x.slug };
  }
  if (cargoIds.length) {
    const r = await db
      .select({ id: cargo.id, name: cargo.name, slug: cargo.slug })
      .from(cargo)
      .where(inArray(cargo.id, cargoIds));
    for (const x of r) refs[`cargo:${x.id}`] = { name: x.name, slug: x.slug };
  }

  return buildCraftGraph(itemId, { recipes: recipeRows, stacks, refs, madeByRecipeIds, usedInRecipeIds });
}
