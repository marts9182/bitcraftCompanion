import { describe, it, expect } from "vitest";
import { inferTrades, type OrderLike } from "./infer-trades";

const order = (over: Partial<OrderLike> = {}): OrderLike => ({
  id: "1", itemId: 10, itemType: 0, region: "7", price: 250, quantity: 5, side: "sell", ...over,
});

describe("inferTrades", () => {
  it("qty decrease on the same order → partial trade for the delta at the order price", () => {
    const prev = [order({ id: "a", quantity: 10, price: 250, side: "sell" })];
    const next = [order({ id: "a", quantity: 7, price: 250, side: "sell" })];
    expect(inferTrades(prev, next)).toEqual([
      { itemId: 10, itemType: 0, region: "7", price: 250, quantity: 3, side: "sell", kind: "partial" },
    ]);
  });

  it("vanished order → filled trade for the full remaining qty", () => {
    const prev = [order({ id: "b", quantity: 4, price: 99, side: "buy", itemId: 22, itemType: 1, region: "3" })];
    expect(inferTrades(prev, [])).toEqual([
      { itemId: 22, itemType: 1, region: "3", price: 99, quantity: 4, side: "buy", kind: "filled" },
    ]);
  });

  it("ignores brand-new orders", () => {
    expect(inferTrades([], [order({ id: "new", quantity: 5 })])).toEqual([]);
  });

  it("ignores qty increases and unchanged orders", () => {
    const prev = [order({ id: "up", quantity: 5 }), order({ id: "same", quantity: 2 })];
    const next = [order({ id: "up", quantity: 9 }), order({ id: "same", quantity: 2 })];
    expect(inferTrades(prev, next)).toEqual([]);
  });

  it("price change on the same id → cancel+new: filled for the old order, new one ignored", () => {
    const prev = [order({ id: "rp", price: 100, quantity: 6 })];
    const next = [order({ id: "rp", price: 120, quantity: 6 })];
    expect(inferTrades(prev, next)).toEqual([
      { itemId: 10, itemType: 0, region: "7", price: 100, quantity: 6, side: "sell", kind: "filled" },
    ]);
  });

  it("skips vanished orders that had zero remaining qty (no phantom trades)", () => {
    expect(inferTrades([order({ id: "z", quantity: 0 })], [])).toEqual([]);
  });

  it("handles a mixed book: both sides, partials + fills + ignores together", () => {
    const prev = [
      order({ id: "s1", side: "sell", quantity: 10, price: 50 }), // partial: 10→6
      order({ id: "s2", side: "sell", quantity: 3, price: 80 }), //  vanished → filled
      order({ id: "b1", side: "buy", quantity: 8, price: 40, itemId: 99 }), // unchanged
    ];
    const next = [
      order({ id: "s1", side: "sell", quantity: 6, price: 50 }),
      order({ id: "b1", side: "buy", quantity: 8, price: 40, itemId: 99 }),
      order({ id: "b2", side: "buy", quantity: 1, price: 10 }), // new → ignored
    ];
    expect(inferTrades(prev, next)).toEqual([
      { itemId: 10, itemType: 0, region: "7", price: 50, quantity: 4, side: "sell", kind: "partial" },
      { itemId: 10, itemType: 0, region: "7", price: 80, quantity: 3, side: "sell", kind: "filled" },
    ]);
  });

  it("returns nothing when both books are empty", () => {
    expect(inferTrades([], [])).toEqual([]);
  });
});
