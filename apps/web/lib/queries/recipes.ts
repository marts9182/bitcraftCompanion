import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getRecipeStacks } from "./craft-graph-db";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type RecipeRow = typeof schema.recipes.$inferSelect;
export interface RecipeListResult {
  rows: RecipeRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listRecipes(params: ListParams): Promise<RecipeListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.recipes.name, `%${params.q}%`));
  if (params.filters.type === "crafting" || params.filters.type === "construction")
    conds.push(eq(schema.recipes.type, params.filters.type));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.recipes).where(where);
  const rows = await db
    .select()
    .from(schema.recipes)
    .where(where)
    .orderBy(schema.recipes.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getRecipeBySlug(slug: string): Promise<RecipeRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.recipes).where(eq(schema.recipes.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllRecipeSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.recipes.slug }).from(schema.recipes);
  return rows.map((r) => r.slug);
}

export { getRecipeStacks };
