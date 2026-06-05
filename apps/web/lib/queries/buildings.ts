import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type BuildingRow = typeof schema.buildings.$inferSelect;
export interface BuildingListResult {
  rows: BuildingRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listBuildings(params: ListParams): Promise<BuildingListResult> {
  const db = getDb();
  const conds = [eq(schema.buildings.showInCompendium, true)];
  if (params.q) conds.push(ilike(schema.buildings.name, `%${params.q}%`));
  const where = and(...conds);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.buildings).where(where);
  const rows = await db
    .select()
    .from(schema.buildings)
    .where(where)
    .orderBy(schema.buildings.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getBuildingBySlug(slug: string): Promise<BuildingRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.buildings).where(eq(schema.buildings.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllBuildingSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ slug: schema.buildings.slug })
    .from(schema.buildings)
    .where(eq(schema.buildings.showInCompendium, true));
  return rows.map((r) => r.slug);
}
