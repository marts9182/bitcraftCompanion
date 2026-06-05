import { describe, it, expect } from "vitest";
import { decodeRarity, toInt, slugify, RARITIES } from "./decode";

describe("decodeRarity", () => {
  it("decodes a numeric index", () => {
    expect(decodeRarity(0)).toBe("Default");
    expect(decodeRarity(5)).toBe("Legendary");
  });
  it("decodes a string name", () => {
    expect(decodeRarity("Rare")).toBe("Rare");
  });
  it("decodes a tagged object {VariantName: ...}", () => {
    expect(decodeRarity({ Epic: [] })).toBe("Epic");
  });
  it("decodes a tagged object with numeric tag {\"3\": ...}", () => {
    expect(decodeRarity({ "3": [] })).toBe("Rare");
  });
  it("falls back to Default on unknown", () => {
    expect(decodeRarity(null)).toBe("Default");
  });
});

describe("toInt", () => {
  it("coerces numbers and numeric strings", () => {
    expect(toInt(5)).toBe(5);
    expect(toInt("7")).toBe(7);
    expect(toInt(undefined)).toBe(null);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Iron Ingot")).toBe("iron-ingot");
    expect(slugify("Tier 3 Axe!")).toBe("tier-3-axe");
  });
  it("strips accents from accented letters", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });
});

describe("RARITIES", () => {
  it("is the canonical ordered list", () => {
    expect(RARITIES).toEqual(["Default", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"]);
  });
});
