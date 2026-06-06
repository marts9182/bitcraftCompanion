import { describe, it, expect } from "vitest";
import { defaultRecipeId } from "./expand";
import type { CalcRecipe } from "./types";

const r = (id: number, inputs: number): CalcRecipe => ({
  id,
  name: `Recipe ${id}`,
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

import { expand } from "./expand";
import type { Subgraph } from "./types";

// Iron Ore (cargo 99) --smelt--> Iron Ingot (item 1, x2) --forge--> Nail (item 2, x1)
// Nail also has a second, costlier recipe (item 2 from item 1 x5) to test alternatives.
const sg: Subgraph = {
  recipesByRef: {
    "item:1": [
      { id: 10, name: "Smelt Iron", timeRequirement: 5, staminaRequirement: 2, outputQty: 2, inputs: [{ refType: "cargo", refId: 99, quantity: 5 }] },
    ],
    "item:2": [
      { id: 20, name: "Forge Nail", timeRequirement: 3, staminaRequirement: 1, outputQty: 1, inputs: [{ refType: "item", refId: 1, quantity: 3 }] },
      { id: 21, name: "Forge Nail (slow)", timeRequirement: 9, staminaRequirement: 4, outputQty: 1, inputs: [{ refType: "item", refId: 1, quantity: 5 }] },
    ],
  },
  refInfo: {
    "item:1": { name: "Iron Ingot", slug: "iron-ingot" },
    "item:2": { name: "Nail", slug: "nail" },
    "cargo:99": { name: "Iron Ore", slug: "iron-ore" },
  },
};

describe("expand", () => {
  it("expands a single-level craft to raw materials", () => {
    const res = expand(sg, { refType: "item", refId: 1, quantity: 2 });
    expect(res.tree.recipeId).toBe(10);
    expect(res.tree.crafts).toBe(1);
    expect(res.shoppingList).toEqual([
      { refType: "cargo", refId: 99, name: "Iron Ore", slug: "iron-ore", quantity: 5 },
    ]);
    expect(res.totals).toEqual({ timeRequirement: 5, staminaRequirement: 2 });
  });

  it("expands multiple levels and aggregates raw materials", () => {
    const res = expand(sg, { refType: "item", refId: 2, quantity: 1 });
    const ore = res.shoppingList.find((l) => l.refId === 99);
    expect(ore?.quantity).toBe(10);
    expect(res.totals.timeRequirement).toBe(13);
  });

  it("rounds craft counts up and reports surplus", () => {
    const res = expand(sg, { refType: "item", refId: 1, quantity: 3 });
    expect(res.tree.crafts).toBe(2);
    expect(res.tree.produced).toBe(4);
    expect(res.tree.surplus).toBe(1);
  });

  it("flags nodes with alternatives and honors a selection override", () => {
    const def = expand(sg, { refType: "item", refId: 2, quantity: 1 });
    expect(def.tree.hasAlternatives).toBe(true);
    const swapped = expand(sg, { refType: "item", refId: 2, quantity: 1 }, { "item:2": 21 });
    const ore = swapped.shoppingList.find((l) => l.refId === 99);
    expect(ore?.quantity).toBe(15);
  });

  it("treats a target with no recipe as a raw material", () => {
    const res = expand(sg, { refType: "cargo", refId: 99, quantity: 4 });
    expect(res.tree.recipeId).toBeNull();
    expect(res.shoppingList).toEqual([
      { refType: "cargo", refId: 99, name: "Iron Ore", slug: "iron-ore", quantity: 4 },
    ]);
    expect(res.totals).toEqual({ timeRequirement: 0, staminaRequirement: 0 });
  });

  it("breaks cycles by treating the repeated ref as raw", () => {
    const cyclic: Subgraph = {
      recipesByRef: {
        "item:1": [{ id: 1, name: "A", timeRequirement: 0, staminaRequirement: 0, outputQty: 1, inputs: [{ refType: "item", refId: 2, quantity: 1 }] }],
        "item:2": [{ id: 2, name: "B", timeRequirement: 0, staminaRequirement: 0, outputQty: 1, inputs: [{ refType: "item", refId: 1, quantity: 1 }] }],
      },
      refInfo: { "item:1": { name: "A", slug: "a" }, "item:2": { name: "B", slug: "b" } },
    };
    const res = expand(cyclic, { refType: "item", refId: 1, quantity: 1 });
    const raw = res.shoppingList.find((l) => l.refId === 1);
    expect(raw?.quantity).toBe(1);
  });
});
