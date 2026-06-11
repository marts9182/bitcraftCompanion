import { describe, it, expect } from "vitest";
import { filterSuggestions, isSuggestKind, SUGGEST_MAX_RESULTS, type SuggestEntry } from "./suggest";

const e = (name: string, tier: number | null = null): SuggestEntry => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  tier,
});

const catalog: SuggestEntry[] = [
  e("Copper Ingot", 1),
  e("Iron Axe", 3),
  e("Iron Ingot", 3),
  e("Roasted Meat", 2),
  e("Wrought Iron Bar", 4),
  e("Zinc Ore", null),
];

describe("filterSuggestions", () => {
  it("matches case-insensitive substrings", () => {
    expect(filterSuggestions(catalog, "ROASTED").map((s) => s.name)).toEqual(["Roasted Meat"]);
    expect(filterSuggestions(catalog, "ingot").map((s) => s.name)).toEqual(["Copper Ingot", "Iron Ingot"]);
  });

  it("ranks prefix matches before mid-string matches", () => {
    expect(filterSuggestions(catalog, "iro").map((s) => s.name)).toEqual([
      "Iron Axe",
      "Iron Ingot",
      "Wrought Iron Bar",
    ]);
  });

  it("requires at least 2 characters (trimmed)", () => {
    expect(filterSuggestions(catalog, "i")).toEqual([]);
    expect(filterSuggestions(catalog, "  z ")).toEqual([]);
    expect(filterSuggestions(catalog, " zi ").map((s) => s.name)).toEqual(["Zinc Ore"]);
  });

  it("returns nothing on no match", () => {
    expect(filterSuggestions(catalog, "obsidian")).toEqual([]);
  });

  it("honors a custom minQuery (palette pages filter from 1 char)", () => {
    expect(filterSuggestions(catalog, "z", undefined, 1).map((s) => s.name)).toEqual(["Zinc Ore"]);
    expect(filterSuggestions(catalog, "", undefined, 1)).toEqual([]);
  });

  it("caps results (default 10) even when prefix matches alone exceed the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => e(`Iron Thing ${String(i).padStart(2, "0")}`, 1));
    expect(filterSuggestions(many, "iron")).toHaveLength(SUGGEST_MAX_RESULTS);
    expect(filterSuggestions(many, "iron", 3).map((s) => s.name)).toEqual([
      "Iron Thing 00",
      "Iron Thing 01",
      "Iron Thing 02",
    ]);
  });

  it("keeps tier on the returned entries", () => {
    expect(filterSuggestions(catalog, "iron axe")[0]).toEqual({ name: "Iron Axe", slug: "iron-axe", tier: 3 });
  });
});

describe("isSuggestKind", () => {
  it("accepts the five catalog kinds and rejects everything else", () => {
    for (const k of ["items", "cargo", "recipes", "resources", "creatures"]) expect(isSuggestKind(k)).toBe(true);
    expect(isSuggestKind("buildings")).toBe(false);
    expect(isSuggestKind("")).toBe(false);
    expect(isSuggestKind("Items")).toBe(false);
  });
});
