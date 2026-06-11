import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, ilike, sql, count } from "drizzle-orm";
import { PRICE_SENTINEL_CEILING } from "@bcc/shared";
import { getDb, schema } from "@/lib/db";
import { MARKET_PAGE_SIZE, type MarketListParams } from "@/lib/market/params";

const { marketItemSummary, marketOrders, marketSales, marketPriceHistory, marketTrades, claims } = schema;

export type MarketSummaryRow = typeof marketItemSummary.$inferSelect;

export async function getMarketList(params: MarketListParams): Promise<{ rows: MarketSummaryRow[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(marketItemSummary.itemName, `%${params.q}%`));
  if (params.type === "item") conds.push(eq(marketItemSummary.itemType, 0));
  if (params.type === "cargo") conds.push(eq(marketItemSummary.itemType, 1));
  const where = conds.length ? and(...conds) : undefined;

  const orderBy =
    params.sort === "ask" ? sql`${marketItemSummary.lowestAsk} asc nulls last` :
    params.sort === "bid" ? sql`${marketItemSummary.highestBid} desc nulls last` :
    params.sort === "askQty" ? desc(marketItemSummary.askQty) :
    params.sort === "name" ? asc(marketItemSummary.itemName) :
    params.sort === "tier" ? sql`${marketItemSummary.tier} desc nulls last` :
    desc(marketItemSummary.soldQtyRecent);

  const [{ total }] = await db.select({ total: count() }).from(marketItemSummary).where(where);
  const rows = await db
    .select()
    .from(marketItemSummary)
    .where(where)
    .orderBy(orderBy, asc(marketItemSummary.itemName))
    .limit(MARKET_PAGE_SIZE)
    .offset((params.page - 1) * MARKET_PAGE_SIZE);
  return { rows, total: Number(total) };
}

export async function getMarketItem(itemType: number, itemId: number): Promise<MarketSummaryRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(marketItemSummary)
    .where(and(eq(marketItemSummary.itemType, itemType), eq(marketItemSummary.itemId, itemId)))
    .limit(1);
  return row ?? null;
}

export interface OrderLadderRow { price: number; quantity: number; cumulative: number; sentinel: boolean; }

export async function getMarketOrders(itemType: number, itemId: number): Promise<{ asks: OrderLadderRow[]; bids: OrderLadderRow[] }> {
  const db = getDb();
  const rows = await db
    .select({ side: marketOrders.side, price: marketOrders.price, quantity: marketOrders.quantity })
    .from(marketOrders)
    .where(and(eq(marketOrders.itemType, itemType), eq(marketOrders.itemId, itemId)));

  const build = (side: "sell" | "buy"): OrderLadderRow[] => {
    const levels = new Map<number, number>();
    for (const r of rows) if (r.side === side) levels.set(r.price, (levels.get(r.price) ?? 0) + r.quantity);
    const sorted = [...levels.entries()].sort((a, b) => (side === "sell" ? a[0] - b[0] : b[0] - a[0]));
    let cum = 0;
    return sorted.map(([price, quantity]) => {
      cum += quantity;
      return { price, quantity, cumulative: cum, sentinel: price >= PRICE_SENTINEL_CEILING };
    });
  };
  return { asks: build("sell"), bids: build("buy") };
}

export interface MarketLocationRow { claimEntityId: string; claimName: string; region: string; bestAsk: number | null; askQty: number; }

export async function getMarketLocations(itemType: number, itemId: number): Promise<MarketLocationRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      claimEntityId: marketOrders.claimEntityId,
      region: marketOrders.region,
      claimName: claims.name,
      bestAsk: sql<number | null>`min(${marketOrders.price}) FILTER (WHERE ${marketOrders.side} = 'sell' AND ${marketOrders.price} < ${PRICE_SENTINEL_CEILING})`,
      askQty: sql<number>`COALESCE(sum(${marketOrders.quantity}) FILTER (WHERE ${marketOrders.side} = 'sell' AND ${marketOrders.price} < ${PRICE_SENTINEL_CEILING}), 0)::int`,
    })
    .from(marketOrders)
    .leftJoin(claims, eq(claims.entityId, marketOrders.claimEntityId))
    .where(and(eq(marketOrders.itemType, itemType), eq(marketOrders.itemId, itemId)))
    .groupBy(marketOrders.claimEntityId, marketOrders.region, claims.name)
    .orderBy(sql`min(${marketOrders.price}) FILTER (WHERE ${marketOrders.side} = 'sell' AND ${marketOrders.price} < ${PRICE_SENTINEL_CEILING}) asc nulls last`);
  return rows.map((r) => ({
    claimEntityId: r.claimEntityId ?? "",
    claimName: r.claimName ?? "",
    region: r.region,
    bestAsk: r.bestAsk,
    askQty: r.askQty,
  }));
}

export interface RecentSaleRow { quantity: number; timestamp: number; region: string; }

export async function getRecentSales(itemType: number, itemId: number, limit = 20): Promise<RecentSaleRow[]> {
  const db = getDb();
  return db
    .select({ quantity: marketSales.quantity, timestamp: marketSales.timestamp, region: marketSales.region })
    .from(marketSales)
    .where(and(eq(marketSales.itemType, itemType), eq(marketSales.itemId, itemId)))
    .orderBy(desc(marketSales.timestamp))
    .limit(limit);
}

export interface RecentTradeRow {
  price: number;
  quantity: number;
  /** "partial" = certain trade (an order's qty decreased); "filled" = order vanished (trade-or-cancel, ambiguous). */
  kind: "partial" | "filled";
  /** Epoch ms — unstable_cache JSON-serializes results, so Dates would come back as strings on cache hits. */
  observedAtMs: number;
}

/**
 * Inferred trades for one item (diffed from order-book snapshots by the worker;
 * closed listings carry no price, so this is the only per-trade price signal).
 * Certain "partial" trades first, then newest first. unstable_cache'd at the
 * worker snapshot cadence (30 min), matching the page revalidate.
 * NB: market_trades.item_type is TEXT ("item"/"cargo") unlike market_orders' 0/1.
 */
export const getRecentTrades = unstable_cache(
  async (itemType: number, itemId: number, limit = 20): Promise<RecentTradeRow[]> => {
    const db = getDb();
    const rows = await db
      .select({ price: marketTrades.price, quantity: marketTrades.quantity, kind: marketTrades.kind, observedAt: marketTrades.observedAt })
      .from(marketTrades)
      .where(and(eq(marketTrades.itemType, itemType === 1 ? "cargo" : "item"), eq(marketTrades.itemId, itemId)))
      .orderBy(sql`(${marketTrades.kind} = 'partial') desc`, desc(marketTrades.observedAt))
      .limit(limit);
    return rows.map((r) => ({
      price: r.price,
      quantity: r.quantity,
      kind: r.kind === "partial" ? "partial" : "filled",
      observedAtMs: r.observedAt.getTime(),
    }));
  },
  ["market-recent-trades"],
  { revalidate: 1800 },
);

export interface PricePoint { snapshotAt: Date; lowestAsk: number | null; highestBid: number | null; soldQtyRecent: number; }

export async function getMarketPriceHistory(itemType: number, itemId: number): Promise<PricePoint[]> {
  const db = getDb();
  return db
    .select({
      snapshotAt: marketPriceHistory.snapshotAt,
      lowestAsk: marketPriceHistory.lowestAsk,
      highestBid: marketPriceHistory.highestBid,
      soldQtyRecent: marketPriceHistory.soldQtyRecent,
    })
    .from(marketPriceHistory)
    .where(and(eq(marketPriceHistory.itemType, itemType), eq(marketPriceHistory.itemId, itemId)))
    .orderBy(asc(marketPriceHistory.snapshotAt));
}

export async function listMarketItemKeys(limit = 500): Promise<{ itemType: number; itemId: number }[]> {
  const db = getDb();
  return db
    .select({ itemType: marketItemSummary.itemType, itemId: marketItemSummary.itemId })
    .from(marketItemSummary)
    .orderBy(desc(marketItemSummary.soldQtyRecent))
    .limit(limit);
}
