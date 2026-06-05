import { describe, it, expect } from "vitest";
import { parseItemListParams, PAGE_SIZE } from "./item-list-params";

describe("parseItemListParams", () => {
  it("applies defaults for empty input", () => {
    expect(parseItemListParams({})).toEqual({ page: 1 });
  });

  it("trims q and drops it when blank", () => {
    expect(parseItemListParams({ q: "  axe " })).toEqual({ q: "axe", page: 1 });
    expect(parseItemListParams({ q: "   " })).toEqual({ page: 1 });
  });

  it("parses tier as an integer and ignores non-numeric", () => {
    expect(parseItemListParams({ tier: "3" })).toEqual({ tier: 3, page: 1 });
    expect(parseItemListParams({ tier: "abc" })).toEqual({ page: 1 });
    expect(parseItemListParams({ tier: "-1" })).toEqual({ tier: -1, page: 1 });
  });

  it("keeps rarity and tag as trimmed strings", () => {
    expect(parseItemListParams({ rarity: "Rare", tag: " Tools " })).toEqual({
      rarity: "Rare",
      tag: "Tools",
      page: 1,
    });
  });

  it("clamps page to a positive integer", () => {
    expect(parseItemListParams({ page: "4" }).page).toBe(4);
    expect(parseItemListParams({ page: "0" }).page).toBe(1);
    expect(parseItemListParams({ page: "-2" }).page).toBe(1);
    expect(parseItemListParams({ page: "x" }).page).toBe(1);
  });

  it("takes the first value when given arrays", () => {
    expect(parseItemListParams({ q: ["sword", "bow"] })).toEqual({ q: "sword", page: 1 });
  });

  it("exposes a page size constant", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});
