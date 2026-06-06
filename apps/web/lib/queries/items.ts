import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CraftGraph } from "./craft-graph";
import { getCraftGraph } from "./craft-graph-db";
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

/** Fetch + assemble the craft graph for an item id (shared with cargo via refType). */
export function getItemCraftGraph(itemId: number): Promise<CraftGraph> {
  return getCraftGraph("item", itemId);
}
