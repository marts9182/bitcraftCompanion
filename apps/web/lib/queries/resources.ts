import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type ResourceRow = typeof schema.resources.$inferSelect;

export const RESOURCES_PAGE_SIZE = 25;

export interface ResourceListParams {
  q?: string;
  category?: string;
  tier?: number;
  page: number;
}

export interface ResourceListResult {
  rows: ResourceRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated, filtered compendium resource list. */
export async function listResources(params: ResourceListParams): Promise<ResourceListResult> {
  const db = getDb();
  const conds = [eq(schema.resources.compendiumEntry, true)];
  if (params.q) conds.push(ilike(schema.resources.name, `%${params.q}%`));
  if (params.category) conds.push(eq(schema.resources.category, params.category));
  if (params.tier !== undefined) conds.push(eq(schema.resources.tier, params.tier));
  const where = and(...conds);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.resources)
    .where(where);

  const rows = await db
    .select()
    .from(schema.resources)
    .where(where)
    .orderBy(asc(schema.resources.name))
    .limit(RESOURCES_PAGE_SIZE)
    .offset((params.page - 1) * RESOURCES_PAGE_SIZE);

  return { rows, total, page: params.page, pageSize: RESOURCES_PAGE_SIZE };
}

/** Distinct non-null categories among compendium resources, sorted. */
export async function listResourceCategories(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ category: schema.resources.category })
    .from(schema.resources)
    .where(and(eq(schema.resources.compendiumEntry, true), isNotNull(schema.resources.category)))
    .orderBy(asc(schema.resources.category));
  return rows.map((r) => r.category).filter((c): c is string => c !== null);
}

/** Distinct non-null tiers among compendium resources, ascending. */
export async function listResourceTiers(): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ tier: schema.resources.tier })
    .from(schema.resources)
    .where(and(eq(schema.resources.compendiumEntry, true), isNotNull(schema.resources.tier)))
    .orderBy(asc(schema.resources.tier));
  return rows.map((r) => r.tier).filter((t): t is number => t !== null);
}

export async function getResourceBySlug(slug: string): Promise<ResourceRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.resources).where(eq(schema.resources.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllResourceSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ slug: schema.resources.slug })
    .from(schema.resources)
    .where(eq(schema.resources.compendiumEntry, true));
  return rows.map((r) => r.slug);
}

/** Headline numbers for the /resources stat cards (single query). */
export async function getResourceStats(): Promise<{ total: number; categories: number; respawning: number }> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      categories: sql<number>`count(distinct ${schema.resources.category})::int`,
      respawning: sql<number>`(count(*) filter (where ${schema.resources.notRespawning} = false))::int`,
    })
    .from(schema.resources)
    .where(eq(schema.resources.compendiumEntry, true));
  return row;
}

/**
 * Slim catalog of ALL resources (incl. non-compendium) for the map finder panel.
 * unstable_cache'd (30 min = worker snapshot cadence): fetched by /map AND every
 * ISR detail page via the map embed.
 *
 * Cache key versioned with the select shape — bump it whenever fields change
 * so a stale cached shape can never be served to the new UI.
 */
export const getResourceMapCatalog = unstable_cache(async () => {
  const db = getDb();
  return db
    .select({
      id: schema.resources.id,
      slug: schema.resources.slug,
      name: schema.resources.name,
      category: schema.resources.category,
      tier: schema.resources.tier,
      spawnCounts: schema.resources.spawnCounts,
      // Nulled for never-respawning nodes so the finder's "respawns Xs" chip
      // tooltip can simply check for a value (and the payload stays one field).
      respawnSeconds: sql<number | null>`case when ${schema.resources.notRespawning} then null else ${schema.resources.respawnSeconds} end`,
    })
    .from(schema.resources)
    .orderBy(asc(schema.resources.name));
}, ["resource-map-catalog-v2"], { revalidate: 1800 });
