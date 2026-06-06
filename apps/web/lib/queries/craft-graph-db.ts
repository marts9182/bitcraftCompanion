import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  buildCraftGraph,
  resolveStackView,
  type CraftGraph,
  type RefInfo,
  type RefType,
  type StackRow,
  type StackView,
} from "./craft-graph";

/** Resolve item/cargo references to name+slug, batched by table. */
export async function resolveRefs(stacks: { refType: RefType; refId: number }[]): Promise<Record<string, RefInfo>> {
  const db = getDb();
  const itemIds = [...new Set(stacks.filter((s) => s.refType === "item").map((s) => s.refId))];
  const cargoIds = [...new Set(stacks.filter((s) => s.refType === "cargo").map((s) => s.refId))];
  const refs: Record<string, RefInfo> = {};
  if (itemIds.length) {
    const r = await db
      .select({ id: schema.items.id, name: schema.items.name, slug: schema.items.slug, icon: schema.items.iconAssetName })
      .from(schema.items)
      .where(inArray(schema.items.id, itemIds));
    for (const x of r) refs[`item:${x.id}`] = { name: x.name, slug: x.slug, iconAssetName: x.icon };
  }
  if (cargoIds.length) {
    const r = await db
      .select({ id: schema.cargo.id, name: schema.cargo.name, slug: schema.cargo.slug, icon: schema.cargo.iconAssetName })
      .from(schema.cargo)
      .where(inArray(schema.cargo.id, cargoIds));
    for (const x of r) refs[`cargo:${x.id}`] = { name: x.name, slug: x.slug, iconAssetName: x.icon };
  }
  return refs;
}

/** Craft graph (made-by / used-in) for any entity, by refType. */
export async function getCraftGraph(refType: RefType, entityId: number): Promise<CraftGraph> {
  const db = getDb();
  const { recipeInputs, recipeOutputs, recipes } = schema;

  const madeByRows = await db
    .select({ recipeId: recipeOutputs.recipeId })
    .from(recipeOutputs)
    .where(and(eq(recipeOutputs.refType, refType), eq(recipeOutputs.refId, entityId)));
  const usedInRows = await db
    .select({ recipeId: recipeInputs.recipeId })
    .from(recipeInputs)
    .where(and(eq(recipeInputs.refType, refType), eq(recipeInputs.refId, entityId)));

  const madeByRecipeIds = [...new Set(madeByRows.map((r) => r.recipeId))];
  const usedInRecipeIds = [...new Set(usedInRows.map((r) => r.recipeId))];
  const allRecipeIds = [...new Set([...madeByRecipeIds, ...usedInRecipeIds])];
  if (allRecipeIds.length === 0) return { madeBy: [], usedIn: [] };

  const recipeRows = await db
    .select({ id: recipes.id, name: recipes.name, slug: recipes.slug, type: recipes.type })
    .from(recipes)
    .where(inArray(recipes.id, allRecipeIds));
  const inputRows = await db.select().from(recipeInputs).where(inArray(recipeInputs.recipeId, allRecipeIds));
  const outputRows = await db.select().from(recipeOutputs).where(inArray(recipeOutputs.recipeId, allRecipeIds));

  const stacks: StackRow[] = [
    ...inputRows.map((r) => ({ recipeId: r.recipeId, direction: "input" as const, refType: r.refType as RefType, refId: r.refId, quantity: r.quantity })),
    ...outputRows.map((r) => ({ recipeId: r.recipeId, direction: "output" as const, refType: r.refType as RefType, refId: r.refId, quantity: r.quantity })),
  ];
  const refs = await resolveRefs(stacks.map((s) => ({ refType: s.refType, refId: s.refId })));
  return buildCraftGraph(entityId, { recipes: recipeRows, stacks, refs, madeByRecipeIds, usedInRecipeIds });
}

/** The input/output stacks of a single recipe, resolved to views. */
export async function getRecipeStacks(recipeId: number): Promise<{ inputs: StackView[]; outputs: StackView[] }> {
  const db = getDb();
  const { recipeInputs, recipeOutputs } = schema;
  const inRows = await db.select().from(recipeInputs).where(eq(recipeInputs.recipeId, recipeId));
  const outRows = await db.select().from(recipeOutputs).where(eq(recipeOutputs.recipeId, recipeId));
  const refs = await resolveRefs([...inRows, ...outRows].map((r) => ({ refType: r.refType as RefType, refId: r.refId })));
  const view = (r: { refType: string; refId: number; quantity: number }): StackView =>
    resolveStackView({ refType: r.refType as RefType, refId: r.refId, quantity: r.quantity }, refs);
  return { inputs: inRows.map(view), outputs: outRows.map(view) };
}
