import { describe, expect, it } from "vitest";
import { dominantBiome, BIOME_NAMES } from "./biomes";

describe("dominantBiome", () => {
  it("returns the clear mode", () => {
    expect(dominantBiome([1, 1, 1, 2, 3])).toBe(1);
    expect(dominantBiome([10, 10, 4, 10, 4])).toBe(10);
  });

  it("breaks ties by the smallest biome id", () => {
    expect(dominantBiome([5, 5, 2, 2])).toBe(2);
    expect(dominantBiome([7, 1, 7, 1])).toBe(1);
  });

  it("returns -1 for an empty array", () => {
    expect(dominantBiome([])).toBe(-1);
  });

  it("returns the only element for a single-element array", () => {
    expect(dominantBiome([10])).toBe(10);
    expect(dominantBiome([0])).toBe(0);
  });
});

describe("BIOME_NAMES", () => {
  it("covers all 15 biomes", () => {
    expect(Object.keys(BIOME_NAMES)).toHaveLength(15);
    expect(BIOME_NAMES[10]).toBe("Open Ocean");
    expect(BIOME_NAMES[0]).toBe("Dev");
  });
});
