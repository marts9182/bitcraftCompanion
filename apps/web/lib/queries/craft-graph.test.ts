import { describe, it, expect } from "vitest";
import { buildCraftGraph, resolveStackView, type CraftGraphInput } from "./craft-graph";

const base: CraftGraphInput = {
  recipes: [
    { id: 10, name: "Smelt Iron", slug: "smelt-iron", type: "crafting" },
    { id: 20, name: "Forge Nail", slug: "forge-nail", type: "crafting" },
  ],
  stacks: [
    // recipe 10 makes item 1 from cargo 99
    { recipeId: 10, direction: "output", refType: "item", refId: 1, quantity: 2 },
    { recipeId: 10, direction: "input", refType: "cargo", refId: 99, quantity: 5 },
    // recipe 20 uses item 1 to make item 2
    { recipeId: 20, direction: "input", refType: "item", refId: 1, quantity: 3 },
    { recipeId: 20, direction: "output", refType: "item", refId: 2, quantity: 1 },
  ],
  refs: {
    "item:1": { name: "Iron Ingot", slug: "iron-ingot" },
    "item:2": { name: "Nail", slug: "nail" },
    "cargo:99": { name: "Iron Ore", slug: "iron-ore" },
  },
  madeByRecipeIds: [10],
  usedInRecipeIds: [20],
};

describe("buildCraftGraph", () => {
  it("groups recipes into madeBy and usedIn", () => {
    const g = buildCraftGraph(1, base);
    expect(g.madeBy.map((r) => r.id)).toEqual([10]);
    expect(g.usedIn.map((r) => r.id)).toEqual([20]);
  });

  it("resolves stack references to name/slug with quantities", () => {
    const g = buildCraftGraph(1, base);
    const madeBy = g.madeBy[0];
    expect(madeBy.outputs).toEqual([
      { refType: "item", refId: 1, name: "Iron Ingot", slug: "iron-ingot", quantity: 2 },
    ]);
    expect(madeBy.inputs).toEqual([
      { refType: "cargo", refId: 99, name: "Iron Ore", slug: "iron-ore", quantity: 5 },
    ]);
  });

  it("falls back to a placeholder name for unresolved refs", () => {
    const g = buildCraftGraph(1, {
      ...base,
      refs: {},
      madeByRecipeIds: [10],
      usedInRecipeIds: [],
    });
    expect(g.madeBy[0].outputs[0]).toEqual({
      refType: "item",
      refId: 1,
      name: "item #1",
      slug: null,
      quantity: 2,
    });
  });

  it("returns empty arrays when the item has no recipes", () => {
    const g = buildCraftGraph(7, { ...base, madeByRecipeIds: [], usedInRecipeIds: [] });
    expect(g).toEqual({ madeBy: [], usedIn: [] });
  });
});

describe("resolveStackView", () => {
  const refs = { "item:1": { name: "Iron Ingot", slug: "iron-ingot" } };
  it("resolves a known ref", () => {
    expect(resolveStackView({ refType: "item", refId: 1, quantity: 2 }, refs)).toEqual({
      refType: "item",
      refId: 1,
      name: "Iron Ingot",
      slug: "iron-ingot",
      quantity: 2,
    });
  });
  it("falls back to a placeholder for an unknown ref", () => {
    expect(resolveStackView({ refType: "cargo", refId: 9, quantity: 1 }, refs)).toEqual({
      refType: "cargo",
      refId: 9,
      name: "cargo #9",
      slug: null,
      quantity: 1,
    });
  });
});
