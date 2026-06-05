import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCraftGraph } from "./craft-graph-db";
import type { CraftGraph } from "./craft-graph";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type CargoRow = typeof schema.cargo.$inferSelect;
export interface CargoListResult {
  rows: CargoRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCargo(params: ListParams): Promise<CargoListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.cargo.name, `%${params.q}%`));
  if (params.filters.tier && /^-?\d+$/.test(params.filters.tier))
    conds.push(eq(schema.cargo.tier, parseInt(params.filters.tier, 10)));
  if (params.filters.rarity) conds.push(eq(schema.cargo.rarity, params.filters.rarity));
  if (params.filters.tag) conds.push(eq(schema.cargo.tag, params.filters.tag));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.cargo).where(where);
  const rows = await db
    .select()
    .from(schema.cargo)
    .where(where)
    .orderBy(schema.cargo.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getCargoBySlug(slug: string): Promise<CargoRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.cargo).where(eq(schema.cargo.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllCargoSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.cargo.slug }).from(schema.cargo);
  return rows.map((r) => r.slug);
}

export function getCargoCraftGraph(cargoId: number): Promise<CraftGraph> {
  return getCraftGraph("cargo", cargoId);
}
