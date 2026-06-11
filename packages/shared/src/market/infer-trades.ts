/** Minimal order shape for trade inference — matches both the rows read back from
 *  market_orders and the freshly mapped MarketOrderRow (id = the stable order entity id). */
export interface OrderLike {
  id: string;
  itemId: number;
  itemType: number; // 0=item, 1=cargo (market_orders convention)
  region: string;
  price: number;
  quantity: number;
  side: "sell" | "buy";
}

export interface InferredTrade {
  itemId: number;
  itemType: number;
  region: string;
  price: number;
  quantity: number;
  side: "sell" | "buy";
  /** "partial": a surviving order's qty decreased — a certain trade at its price.
   *  "filled": the order vanished — traded its remaining qty OR was cancelled (ambiguous;
   *  stored anyway so consumers can weight "partial" higher). */
  kind: "partial" | "filled";
}

/**
 * Infer trades between two order-book snapshots (closed_listing_state carries NO price,
 * so diffing the books is the only per-trade price signal). Orders are matched by their
 * stable order entity id:
 * - quantity DECREASED on the same id (same price) → traded the delta at that price ("partial")
 * - order PRESENT before, ABSENT now → traded its remaining qty ("filled", trade-or-cancel)
 * - price CHANGED on the same id (rare) → treated as cancel+new → "filled" for the old order
 * - quantity increases, unchanged orders, and brand-new orders → ignored
 */
export function inferTrades(prev: OrderLike[], next: OrderLike[]): InferredTrade[] {
  const nextById = new Map(next.map((o) => [o.id, o]));
  const trades: InferredTrade[] = [];
  for (const p of prev) {
    const n = nextById.get(p.id);
    if (!n || n.price !== p.price) {
      if (p.quantity > 0) trades.push(toTrade(p, p.quantity, "filled"));
      continue;
    }
    if (n.quantity < p.quantity) trades.push(toTrade(p, p.quantity - n.quantity, "partial"));
  }
  return trades;
}

function toTrade(o: OrderLike, quantity: number, kind: InferredTrade["kind"]): InferredTrade {
  return { itemId: o.itemId, itemType: o.itemType, region: o.region, price: o.price, quantity, side: o.side, kind };
}
