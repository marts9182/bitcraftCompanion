import "server-only";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export interface HomeStats {
  settlements: number;
  players: number;
  empires: number;
  tradedItems: number;
}

/** Live counts for the homepage stat strip. */
export async function getHomeStats(): Promise<HomeStats> {
  const db = getDb();
  const [s] = await db.select({ c: count() }).from(schema.settlements);
  const [p] = await db.select({ c: count() }).from(schema.players);
  const [e] = await db.select({ c: count() }).from(schema.empires);
  const [m] = await db.select({ c: count() }).from(schema.marketItemSummary);
  return {
    settlements: Number(s.c),
    players: Number(p.c),
    empires: Number(e.c),
    tradedItems: Number(m.c),
  };
}
