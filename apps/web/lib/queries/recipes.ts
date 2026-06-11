import "server-only";
import { unstable_cache } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getRecipeStacks } from "./craft-graph-db";
import { PAGE_SIZE, parseIntParam, type ListParams } from "./list-params";
import { recipeVerb } from "@/lib/recipes";
import type { SuggestEntry } from "@/lib/suggest";

export type RecipeRow = typeof schema.recipes.$inferSelect;

/** A row for the recipes list, resolved to what the recipe produces. */
export interface RecipeListRow {
  slug: string;
  name: string; // primary output (item/cargo) name — the display title
  verb: string; // action verb from the recipe template ("Craft {0}" → "Craft")
  type: string; // crafting | construction
  tier: number | null; // primary output tier
  iconAssetName: string | null;
  rarity: string;
}
export interface RecipeListResult {
  rows: RecipeListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/*
 * Shared fragments of the primary-output query, interpolated into BOTH the
 * PRIMARY_OUT CTE (list path) and getRecipePrimaryOutput (detail path). The
 * two query shapes are deliberately separate rather than the detail path
 * reusing the CTE: Postgres won't reliably push `WHERE r.id = $1` into a
 * DISTINCT ON CTE, so the detail page keeps its own targeted query.
 */
const PRIMARY_OUT_COLS = sql`
      COALESCE(i.name, c.name) AS out_name,
      COALESCE(i.icon_asset_name, c.icon_asset_name) AS out_icon,
      COALESCE(i.tier, c.tier) AS out_tier,
      COALESCE(i.rarity, c.rarity, 'Default') AS out_rarity`;
const PRIMARY_OUT_FROM = sql`
    FROM recipes r
    JOIN recipe_outputs ro ON ro.recipe_id = r.id
    LEFT JOIN items i ON ro.ref_type = 'item' AND i.id = ro.ref_id
    LEFT JOIN cargo c ON ro.ref_type = 'cargo' AND c.id = ro.ref_id`;
/*
 * Resolvable outputs first (false sorts before true), so a recipe whose
 * top-quantity output is an unresolvable ghost id still resolves to a name
 * via its next resolvable output instead of vanishing under the makeable
 * filter; then highest quantity, then ref_id + ref_type so the pick is
 * fully deterministic (an item row and a cargo row can share ref_id).
 */
const PRIMARY_OUT_TIEBREAK = sql`(COALESCE(i.id, c.id) IS NULL), ro.quantity DESC, ro.ref_id, ro.ref_type`;

/**
 * Each recipe's PRIMARY output = its highest-quantity resolvable output stack
 * (see PRIMARY_OUT_TIEBREAK), joined to items/cargo for name/icon/tier/rarity.
 * Recipe names are unresolved localization templates ("Craft {0}"), so the
 * output is the only readable title. Postgres `DISTINCT ON (r.id)` + the
 * ORDER BY picks exactly one row per recipe.
 *
 * Cost note: listRecipes runs this DISTINCT ON join twice per request
 * (count + page), uncached — fine at ~8.2k recipes (tens of ms warm). If
 * recipes grow ~10x or this shows in Neon metrics, denormalize the primary
 * output's name/tier into the recipes table at snapshot time instead.
 */
const PRIMARY_OUT = sql`
  WITH primary_out AS (
    SELECT DISTINCT ON (r.id)
      r.id, r.slug, r.name AS template, r.type,${PRIMARY_OUT_COLS}${PRIMARY_OUT_FROM}
    ORDER BY r.id, ${PRIMARY_OUT_TIEBREAK}
  )`;

/**
 * Makeable = the recipe actually produces a real item/cargo: a resolvable
 * output name and not the tier -1 sentinel (`NULL <> -1` is NULL, so untiered
 * outputs are excluded too). ~621 construction/building recipes have no
 * item/cargo output and are intentionally hidden from the list.
 */
const MAKEABLE = sql`out_name IS NOT NULL AND out_tier <> -1`;

interface PrimaryOutRow {
  slug: string;
  template: string;
  type: string;
  out_name: string;
  out_icon: string | null;
  out_tier: number | null;
  out_rarity: string;
}

export async function listRecipes(params: ListParams): Promise<RecipeListResult> {
  const db = getDb();
  const conds = [MAKEABLE];
  const type = params.filters.type;
  if (type === "crafting" || type === "construction") conds.push(sql`type = ${type}`);
  const tierNum = parseIntParam(params.filters.tier);
  if (tierNum !== undefined) conds.push(sql`out_tier = ${tierNum}`);
  if (params.q) conds.push(sql`out_name ILIKE ${"%" + params.q + "%"}`);
  const where = sql.join(conds, sql` AND `);

  const totalRes = (await db.execute(
    sql`${PRIMARY_OUT} SELECT count(*)::int AS total FROM primary_out WHERE ${where}`,
  )) as unknown as { total: number }[];
  const total = totalRes[0]?.total ?? 0;

  const raw = (await db.execute(sql`
    ${PRIMARY_OUT}
    SELECT slug, template, type, out_name, out_icon, out_tier, out_rarity
    FROM primary_out
    WHERE ${where}
    ORDER BY out_name, slug
    LIMIT ${PAGE_SIZE} OFFSET ${(params.page - 1) * PAGE_SIZE}
  `)) as unknown as PrimaryOutRow[];
  const rows: RecipeListRow[] = raw.map((r) => ({
    slug: r.slug,
    name: r.out_name,
    verb: recipeVerb(r.template),
    type: r.type,
    tier: r.out_tier,
    iconAssetName: r.out_icon,
    rarity: r.out_rarity,
  }));
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

/**
 * Distinct primary-output tiers across makeable recipes, for the data-driven
 * Tier filter select — every option is guaranteed to match rows. Cached: the
 * answer only changes at snapshot cadence (same pattern as map/suggest caches).
 */
export const listRecipeOutputTiers = unstable_cache(
  async (): Promise<number[]> => {
    const db = getDb();
    const rows = (await db.execute(sql`
      ${PRIMARY_OUT}
      SELECT DISTINCT out_tier AS tier FROM primary_out
      WHERE ${MAKEABLE}
      ORDER BY tier
    `)) as unknown as { tier: number }[];
    return rows.map((r) => r.tier);
  },
  ["recipe-primary-output-tiers"],
  { revalidate: 1800 },
);

/**
 * Typeahead catalog for recipes: resolved primary-output names (what players
 * actually search for) with the template verb so duplicate outputs stay
 * distinguishable ("Craft · Plank" vs "Recraft · Plank"). Makeable only,
 * name-sorted (filterSuggestions relies on catalog order).
 */
export async function listRecipeSuggestEntries(): Promise<SuggestEntry[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    ${PRIMARY_OUT}
    SELECT slug, template, out_name, out_tier FROM primary_out
    WHERE ${MAKEABLE}
    ORDER BY out_name, slug
  `)) as unknown as Pick<PrimaryOutRow, "slug" | "template" | "out_name" | "out_tier">[];
  return rows.map((r) => ({ name: r.out_name, slug: r.slug, tier: r.out_tier, verb: recipeVerb(r.template) }));
}

/** The primary output (name/icon/tier/rarity) for one recipe, or null if it has none. */
export async function getRecipePrimaryOutput(
  recipeId: number,
): Promise<{ name: string; iconAssetName: string | null; tier: number | null; rarity: string } | null> {
  const db = getDb();
  // Same shape as the PRIMARY_OUT CTE but targeted at one recipe — Postgres
  // won't reliably push WHERE id=$1 into a DISTINCT ON CTE, hence the
  // duplication; the shared PRIMARY_OUT_* fragments keep both in sync.
  const res = (await db.execute(sql`
    SELECT DISTINCT ON (r.id)${PRIMARY_OUT_COLS}${PRIMARY_OUT_FROM}
    WHERE r.id = ${recipeId}
    ORDER BY r.id, ${PRIMARY_OUT_TIEBREAK}
  `)) as unknown as { out_name: string | null; out_icon: string | null; out_tier: number | null; out_rarity: string }[];
  const row = res[0];
  if (!row || row.out_name == null) return null;
  return { name: row.out_name, iconAssetName: row.out_icon, tier: row.out_tier, rarity: row.out_rarity };
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
