import { describe, it, expect } from "vitest";
import { defaultRecipeId } from "./expand";
import type { CalcRecipe } from "./types";

const r = (id: number, inputs: number): CalcRecipe => ({
  id,
  name: `Recipe ${id}`,
  type: "crafting",
  timeRequirement: 0,
  staminaRequirement: 0,
  outputQty: 1,
  inputs: Array.from({ length: inputs }, (_, i) => ({ refType: "item" as const, refId: 1000 + i, quantity: 1 })),
});

describe("defaultRecipeId", () => {
  it("prefers the recipe with the fewest inputs", () => {
    expect(defaultRecipeId([r(5, 3), r(6, 1), r(7, 2)])).toBe(6);
  });
  it("breaks ties by lowest id", () => {
    expect(defaultRecipeId([r(9, 2), r(4, 2)])).toBe(4);
  });
});
