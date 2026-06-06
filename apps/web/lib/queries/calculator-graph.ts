import "server-only";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { assembleSubgraph, type RawStackRow } from "@/lib/calculator/subgraph";
import { resolveRefs } from "./craft-graph-db";
import type { RefKey, RefType, Subgraph } from "@/lib/calculator/types";
import { refKey } from "@/lib/calculator/types";

const CRAFTING = "crafting";

/** Transitive-closure subgraph reachable from a target (crafting recipes only). */
export async function getCalculatorSubgraph(refType: RefType, refId: number): Promise<Subgraph> {
  const db = getDb();
  const { recipes, recipeInputs, recipeOutputs } = schema;

  const seen = new Set<RefKey>([refKey(refType, refId)]);
  const fetchedRecipes = new Set<number>();
  let frontier: { refType: RefType; refId: number }[] = [{ refType, refId }];

  const recipeRows = new Map<number, typeof recipes.$inferSelect>();
  const outputRows: RawStackRow[] = [];
  const inputRows: RawStackRow[] = [];

  while (frontier.length) {
    const outs = await db
      .select()
      .from(recipeOutputs)
      .where(or(...frontier.map((f) => and(eq(recipeOutputs.refType, f.refType), eq(recipeOutputs.refId, f.refId)))));

    const outRecipeIds = [...new Set(outs.map((o) => o.recipeId))];
    const recs = outRecipeIds.length
      ? await db.select().from(recipes).where(and(inArray(recipes.id, outRecipeIds), eq(recipes.type, CRAFTING)))
      : [];
    const craftingIds = new Set(recs.map((r) => r.id));
    for (const r of recs) recipeRows.set(r.id, r);

    for (const o of outs) {
      if (craftingIds.has(o.recipeId)) {
        outputRows.push({ recipeId: o.recipeId, refType: o.refType as RefType, refId: o.refId, quantity: o.quantity });
      }
    }

    const newRecipeIds = [...craftingIds].filter((id) => !fetchedRecipes.has(id));
    const ins = newRecipeIds.length
      ? await db.select().from(recipeInputs).where(inArray(recipeInputs.recipeId, newRecipeIds))
      : [];
    for (const id of newRecipeIds) fetchedRecipes.add(id);

    const next: { refType: RefType; refId: number }[] = [];
    for (const i of ins) {
      inputRows.push({ recipeId: i.recipeId, refType: i.refType as RefType, refId: i.refId, quantity: i.quantity });
      const k = refKey(i.refType as RefType, i.refId);
      if (!seen.has(k)) {
        seen.add(k);
        next.push({ refType: i.refType as RefType, refId: i.refId });
      }
    }
    frontier = next;
  }

  const allStacks = [...outputRows, ...inputRows];
  const refInfo = (await resolveRefs(allStacks.map((s) => ({ refType: s.refType, refId: s.refId })))) as Record<RefKey, { name: string; slug: string; iconAssetName?: string | null }>;

  return assembleSubgraph({
    recipes: [...recipeRows.values()].map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      timeRequirement: r.timeRequirement,
      staminaRequirement: r.staminaRequirement,
    })),
    outputs: outputRows,
    inputs: inputRows,
    refInfo,
  });
}

export interface TargetHit {
  refType: RefType;
  refId: number;
  name: string;
  slug: string;
  iconAssetName: string | null;
}

/** Search items and cargo by name for the calculator finder. */
export async function searchTargets(q: string, limit = 20): Promise<TargetHit[]> {
  const db = getDb();
  const like = `%${q}%`;
  const itemRows = await db
    .select({ id: schema.items.id, name: schema.items.name, slug: schema.items.slug, icon: schema.items.iconAssetName })
    .from(schema.items)
    .where(ilike(schema.items.name, like))
    .orderBy(schema.items.name)
    .limit(limit);
  const cargoRows = await db
    .select({ id: schema.cargo.id, name: schema.cargo.name, slug: schema.cargo.slug, icon: schema.cargo.iconAssetName })
    .from(schema.cargo)
    .where(ilike(schema.cargo.name, like))
    .orderBy(schema.cargo.name)
    .limit(limit);
  const hits: TargetHit[] = [
    ...itemRows.map((r) => ({ refType: "item" as const, refId: r.id, name: r.name, slug: r.slug, iconAssetName: r.icon })),
    ...cargoRows.map((r) => ({ refType: "cargo" as const, refId: r.id, name: r.name, slug: r.slug, iconAssetName: r.icon })),
  ];
  return hits.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

/** Distinct item/cargo targets that have at least one crafting recipe (for SSG + sitemap). */
export async function listCraftableTargets(): Promise<{ refType: RefType; slug: string }[]> {
  const db = getDb();
  const { recipeOutputs, recipes, items, cargo } = schema;
  const itemRows = await db
    .selectDistinct({ slug: items.slug })
    .from(recipeOutputs)
    .innerJoin(recipes, and(eq(recipes.id, recipeOutputs.recipeId), eq(recipes.type, CRAFTING)))
    .innerJoin(items, and(eq(recipeOutputs.refType, "item"), eq(items.id, recipeOutputs.refId)));
  const cargoRows = await db
    .selectDistinct({ slug: cargo.slug })
    .from(recipeOutputs)
    .innerJoin(recipes, and(eq(recipes.id, recipeOutputs.recipeId), eq(recipes.type, CRAFTING)))
    .innerJoin(cargo, and(eq(recipeOutputs.refType, "cargo"), eq(cargo.id, recipeOutputs.refId)));
  return [
    ...itemRows.map((r) => ({ refType: "item" as const, slug: r.slug })),
    ...cargoRows.map((r) => ({ refType: "cargo" as const, slug: r.slug })),
  ];
}
