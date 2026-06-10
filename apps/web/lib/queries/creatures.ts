import "server-only";
import { and, asc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type CreatureRow = typeof schema.creatures.$inferSelect;

export const CREATURES_PAGE_SIZE = 25;

export interface CreatureListParams {
  q?: string;
  tier?: number;
  /** true = huntable animals, false = monsters, undefined = all. */
  huntable?: boolean;
  page: number;
}

export interface CreatureListResult {
  rows: CreatureRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated, filtered creature list. All 41 creatures are compendium-worthy — no base filter. */
export async function listCreatures(params: CreatureListParams): Promise<CreatureListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.creatures.name, `%${params.q}%`));
  if (params.tier !== undefined) conds.push(eq(schema.creatures.tier, params.tier));
  if (params.huntable !== undefined) conds.push(eq(schema.creatures.huntable, params.huntable));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.creatures)
    .where(where);

  const rows = await db
    .select()
    .from(schema.creatures)
    .where(where)
    .orderBy(asc(schema.creatures.name))
    .limit(CREATURES_PAGE_SIZE)
    .offset((params.page - 1) * CREATURES_PAGE_SIZE);

  return { rows, total, page: params.page, pageSize: CREATURES_PAGE_SIZE };
}

/** Distinct non-null creature tiers, ascending. */
export async function listCreatureTiers(): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ tier: schema.creatures.tier })
    .from(schema.creatures)
    .where(isNotNull(schema.creatures.tier))
    .orderBy(asc(schema.creatures.tier));
  return rows.map((r) => r.tier).filter((t): t is number => t !== null);
}

export async function getCreatureBySlug(slug: string): Promise<CreatureRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.creatures).where(eq(schema.creatures.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllCreatureSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.creatures.slug }).from(schema.creatures);
  return rows.map((r) => r.slug);
}

/** Headline numbers for the /creatures stat cards (single query). */
export async function getCreatureStats(): Promise<{ total: number; huntable: number; monsters: number }> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      huntable: sql<number>`(count(*) filter (where ${schema.creatures.huntable} = true))::int`,
      monsters: sql<number>`(count(*) filter (where ${schema.creatures.huntable} = false))::int`,
    })
    .from(schema.creatures);
  return row;
}

/** Slim catalog of all creatures for the map finder panel. */
export async function getCreatureMapCatalog() {
  const db = getDb();
  return db
    .select({
      enemyType: schema.creatures.enemyType,
      slug: schema.creatures.slug,
      name: schema.creatures.name,
      tier: schema.creatures.tier,
      spawnCounts: schema.creatures.spawnCounts,
    })
    .from(schema.creatures)
    .orderBy(asc(schema.creatures.name));
}
