import { describe, it, expect } from "vitest";
import { parseIntParam, parseListParams, PAGE_SIZE } from "./list-params";

describe("parseListParams", () => {
  it("defaults to page 1 and empty filters", () => {
    expect(parseListParams({}, ["tier"])).toEqual({ page: 1, filters: {} });
  });

  it("trims q and drops it when blank", () => {
    expect(parseListParams({ q: "  axe " }, [])).toEqual({ q: "axe", page: 1, filters: {} });
    expect(parseListParams({ q: "   " }, [])).toEqual({ page: 1, filters: {} });
  });

  it("keeps only allowed filters (trimmed), drops others", () => {
    const out = parseListParams({ tier: "3", rarity: "Rare", type: "crafting" }, ["tier", "type"]);
    expect(out.filters).toEqual({ tier: "3", type: "crafting" });
  });

  it("clamps page to a positive integer", () => {
    expect(parseListParams({ page: "4" }, []).page).toBe(4);
    expect(parseListParams({ page: "0" }, []).page).toBe(1);
    expect(parseListParams({ page: "-2" }, []).page).toBe(1);
    expect(parseListParams({ page: "x" }, []).page).toBe(1);
  });

  it("takes the first value when given arrays", () => {
    expect(parseListParams({ q: ["sword", "bow"], tier: ["1", "2"] }, ["tier"])).toEqual({
      q: "sword",
      page: 1,
      filters: { tier: "1" },
    });
  });

  it("exposes PAGE_SIZE", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});

describe("parseIntParam", () => {
  it("parses whole numbers, including negatives", () => {
    expect(parseIntParam("3")).toBe(3);
    expect(parseIntParam("-1")).toBe(-1);
    expect(parseIntParam("0")).toBe(0);
  });

  it("returns undefined for missing values", () => {
    expect(parseIntParam(undefined)).toBeUndefined();
    expect(parseIntParam("")).toBeUndefined();
  });

  it("rejects non-integer garbage", () => {
    expect(parseIntParam("3.5")).toBeUndefined();
    expect(parseIntParam("12abc")).toBeUndefined();
    expect(parseIntParam("abc")).toBeUndefined();
  });
});
