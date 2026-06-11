import { describe, it, expect } from "vitest";
import {
  profitPercent,
  distanceTiles,
  profitPerTile,
  deriveDealMath,
  filterDeals,
  parseDealsParams,
  DEFAULT_MAX_PROFIT_PCT,
  type Deal,
  type DealLocation,
} from "./deals";

const loc = (over: Partial<DealLocation> = {}): DealLocation => ({
  claimEntityId: "1",
  claimName: "Stormhollow",
  region: "7",
  x: 0,
  z: 0,
  ...over,
});

describe("profitPercent", () => {
  it("is profit relative to what you PAY (the sell-order price)", () => {
    expect(profitPercent(2, 125)).toBeCloseTo(6150);
    expect(profitPercent(100, 150)).toBeCloseTo(50);
  });
  it("returns null when the pay price is zero or negative (cannot divide)", () => {
    expect(profitPercent(0, 100)).toBeNull();
    expect(profitPercent(-1, 100)).toBeNull();
  });
});

describe("distanceTiles", () => {
  it("is straight-line small-hex distance ÷3 = game tiles (matches N/E coords)", () => {
    // 9-12-15 triangle in small-hex units → 15 small-hex = 5 tiles.
    expect(distanceTiles(0, 0, 9, 12)).toBe(5);
  });
  it("returns null when either end has no coordinates", () => {
    expect(distanceTiles(null, null, 9, 12)).toBeNull();
    expect(distanceTiles(0, 0, null, 12)).toBeNull();
  });
  it("is zero for identical points", () => {
    expect(distanceTiles(5, 5, 5, 5)).toBe(0);
  });
});

describe("profitPerTile", () => {
  it("divides total profit by distance", () => {
    expect(profitPerTile(500, 5)).toBe(100);
  });
  it("returns null for unknown distance and for zero distance (instant flip — never divide by zero)", () => {
    expect(profitPerTile(500, null)).toBeNull();
    expect(profitPerTile(500, 0)).toBeNull();
  });
});

describe("deriveDealMath", () => {
  const base = {
    payPrice: 2,
    receivePrice: 125,
    sellQty: 10,
    buyQty: 4,
    buyAt: loc({ claimEntityId: "a", x: 0, z: 0 }),
    sellAt: loc({ claimEntityId: "b", x: 9, z: 12 }),
  };

  it("qty = min(sell order qty, buy order qty); profit math from pay/receive", () => {
    const d = deriveDealMath(base);
    expect(d.qty).toBe(4);
    expect(d.profitEach).toBe(123);
    expect(d.profitTotal).toBe(492);
    expect(d.profitPct).toBeCloseTo(6150);
    expect(d.instantFlip).toBe(false);
    expect(d.distanceTiles).toBe(5);
    expect(d.profitPerTile).toBeCloseTo(492 / 5);
  });

  it("flags same-marketplace pairs as instant flips: distance 0, profit/tile null", () => {
    const d = deriveDealMath({ ...base, sellAt: loc({ claimEntityId: "a", x: 9, z: 12 }) });
    expect(d.instantFlip).toBe(true);
    expect(d.distanceTiles).toBe(0);
    expect(d.profitPerTile).toBeNull();
  });

  it("does NOT treat two unknown claims (empty ids) as the same marketplace", () => {
    const d = deriveDealMath({
      ...base,
      buyAt: loc({ claimEntityId: "", x: null, z: null }),
      sellAt: loc({ claimEntityId: "", x: null, z: null }),
    });
    expect(d.instantFlip).toBe(false);
    expect(d.distanceTiles).toBeNull();
  });

  it("degrades gracefully when coordinates are missing: distance + profit/tile null", () => {
    const d = deriveDealMath({ ...base, sellAt: loc({ claimEntityId: "b", x: null, z: null }) });
    expect(d.distanceTiles).toBeNull();
    expect(d.profitPerTile).toBeNull();
  });
});

function deal(over: Partial<Deal>): Deal {
  return {
    itemId: 1,
    itemType: 0,
    itemName: "Rough Plank",
    itemSlug: "rough-plank",
    iconAssetName: null,
    tier: 1,
    rarity: "Default",
    buyAt: loc({ claimEntityId: "a", region: "7" }),
    sellAt: loc({ claimEntityId: "b", region: "9" }),
    payPrice: 2,
    receivePrice: 125,
    qty: 4,
    profitEach: 123,
    profitTotal: 492,
    profitPct: 6150,
    distanceTiles: 5,
    profitPerTile: 98.4,
    instantFlip: false,
    ...over,
  };
}

describe("filterDeals", () => {
  it("minQty drops smaller deals", () => {
    expect(filterDeals([deal({ qty: 3 }), deal({ qty: 10 })], { minQty: 5 })).toHaveLength(1);
  });

  it("minPct/maxPct bound profit % — maxPct kills stale-order traps", () => {
    const deals = [deal({ profitPct: 20 }), deal({ profitPct: 400 }), deal({ profitPct: 12000 })];
    expect(filterDeals(deals, { minPct: 50 })).toHaveLength(2);
    expect(filterDeals(deals, { maxPct: 500 })).toHaveLength(2);
    expect(filterDeals(deals, { minPct: 50, maxPct: 500 })).toHaveLength(1);
  });

  it("excludes unknown profit % when either pct bound is active (cannot verify)", () => {
    expect(filterDeals([deal({ profitPct: null })], { maxPct: 500 })).toHaveLength(0);
    expect(filterDeals([deal({ profitPct: null })], { minPct: 1 })).toHaveLength(0);
    expect(filterDeals([deal({ profitPct: null })], {})).toHaveLength(1);
  });

  it("maxDistance applies only to rows with a known distance (missing coords pass through)", () => {
    const deals = [deal({ distanceTiles: 100 }), deal({ distanceTiles: 2000 }), deal({ distanceTiles: null })];
    expect(filterDeals(deals, { maxDistance: 500 })).toHaveLength(2);
  });

  it("keeps instant flips under any maxDistance (distance 0)", () => {
    expect(filterDeals([deal({ instantFlip: true, distanceTiles: 0 })], { maxDistance: 1 })).toHaveLength(1);
  });

  it("region matches when EITHER end is in the region", () => {
    const deals = [
      deal({ buyAt: loc({ region: "7" }), sellAt: loc({ region: "9" }) }),
      deal({ buyAt: loc({ region: "3" }), sellAt: loc({ region: "7" }) }),
      deal({ buyAt: loc({ region: "3" }), sellAt: loc({ region: "4" }) }),
    ];
    expect(filterDeals(deals, { region: "7" })).toHaveLength(2);
  });
});

describe("parseDealsParams", () => {
  it("defaults: no qty/distance/region filters, maxPct defaults to the stale-trap cap", () => {
    expect(parseDealsParams({})).toEqual({ maxPct: DEFAULT_MAX_PROFIT_PCT });
  });

  it("parses numeric filters and trims region", () => {
    expect(parseDealsParams({ minQty: "5", minPct: "10", maxPct: "900", maxDistance: "1500", region: " 7 " })).toEqual({
      minQty: 5,
      minPct: 10,
      maxPct: 900,
      maxDistance: 1500,
      region: "7",
    });
  });

  it("a PRESENT-but-empty maxPct disables the cap (user cleared the field)", () => {
    expect(parseDealsParams({ maxPct: "" }).maxPct).toBeUndefined();
  });

  it("a present-but-garbage maxPct keeps the protective default cap (never disables it)", () => {
    expect(parseDealsParams({ maxPct: "abc" }).maxPct).toBe(DEFAULT_MAX_PROFIT_PCT);
    expect(parseDealsParams({ maxPct: "-5" }).maxPct).toBe(DEFAULT_MAX_PROFIT_PCT);
    expect(parseDealsParams({ maxPct: "0" }).maxPct).toBe(DEFAULT_MAX_PROFIT_PCT);
  });

  it("ignores garbage and non-positive values", () => {
    expect(parseDealsParams({ minQty: "abc", minPct: "-5", maxDistance: "0" })).toEqual({ maxPct: DEFAULT_MAX_PROFIT_PCT });
  });

  it("takes the first value of repeated params", () => {
    expect(parseDealsParams({ minQty: ["5", "9"] }).minQty).toBe(5);
  });
});
