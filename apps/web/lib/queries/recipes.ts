import "server-only";
import { and, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getRecipeStacks } from "./craft-graph-db";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type RecipeRow = typeof schema.recipes.$inferSelect;
export interface RecipeListRow extends RecipeRow {
  /** MAX tier across the recipe's outputs (items + cargo); null when no tiered output. */
  outputTier: number | null;
}
export interface RecipeListResult {
  rows: RecipeListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Recipes have no tier of their own — derive one as the MAX tier across the
 * recipe's outputs (recipe_outputs → items on refType='item', cargo on
 * refType='cargo'). Scalar subquery correlated on the outer recipes.id;
 * recipe_outputs_recipe_idx makes the per-row lookup cheap.
 *
 * The correlated outer reference is written literally as `recipes.id`:
 * interpolating ${schema.recipes.id} renders the UNQUALIFIED `"id"` in
 * single-table selects, which is ambiguous inside the subquery (i.id / c.id).
 */
export const recipeOutputTierSql = sql<number | null>`(
  select max(coalesce(i.tier, c.tier))
  from recipe_outputs ro
  left join items i on ro.ref_type = 'item' and ro.ref_id = i.id
  left join cargo c on ro.ref_type = 'cargo' and ro.ref_id = c.id
  where ro.recipe_id = recipes.id
)`;

export async function listRecipes(params: ListParams): Promise<RecipeListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.recipes.name, `%${params.q}%`));
  if (params.filters.type === "crafting" || params.filters.type === "construction")
    conds.push(eq(schema.recipes.type, params.filters.type));
  if (params.filters.tier && /^-?\d+$/.test(params.filters.tier))
    conds.push(sql`${recipeOutputTierSql} = ${parseInt(params.filters.tier, 10)}`);
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.recipes).where(where);
  const rows = await db
    .select({ ...getTableColumns(schema.recipes), outputTier: recipeOutputTierSql })
    .from(schema.recipes)
    .where(where)
    .orderBy(schema.recipes.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

/**
 * Distinct derived output tiers (≥ 0) for the data-driven Tier filter select.
 * Computed over per-recipe MAX so every option is guaranteed to match rows.
 */
export async function listRecipeOutputTiers(): Promise<number[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    select distinct s.tier
    from (
      select max(coalesce(i.tier, c.tier)) as tier
      from recipe_outputs ro
      left join items i on ro.ref_type = 'item' and ro.ref_id = i.id
      left join cargo c on ro.ref_type = 'cargo' and ro.ref_id = c.id
      group by ro.recipe_id
    ) s
    where s.tier is not null and s.tier >= 0
    order by s.tier
  `)) as unknown as { tier: number }[];
  return rows.map((r) => r.tier);
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
