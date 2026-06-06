import { describe, it, expect } from "vitest";
import { assembleSubgraph } from "./subgraph";

describe("assembleSubgraph", () => {
  it("groups recipes by produced ref with scoped outputQty and inputs", () => {
    const sg = assembleSubgraph({
      recipes: [{ id: 10, name: "Smelt Iron", type: "crafting", timeRequirement: 5, staminaRequirement: null }],
      outputs: [{ recipeId: 10, refType: "item", refId: 1, quantity: 2 }],
      inputs: [{ recipeId: 10, refType: "cargo", refId: 99, quantity: 5 }],
      refInfo: { "item:1": { name: "Iron Ingot", slug: "iron-ingot" } },
    });
    expect(sg.recipesByRef["item:1"]).toEqual([
      {
        id: 10,
        name: "Smelt Iron",
        timeRequirement: 5,
        staminaRequirement: 0,
        outputQty: 2,
        inputs: [{ refType: "cargo", refId: 99, quantity: 5 }],
      },
    ]);
    expect(sg.refInfo["item:1"].name).toBe("Iron Ingot");
  });

  it("registers the same recipe under each ref it produces", () => {
    const sg = assembleSubgraph({
      recipes: [{ id: 30, name: "Saw Logs", type: "crafting", timeRequirement: 1, staminaRequirement: 1 }],
      outputs: [
        { recipeId: 30, refType: "item", refId: 5, quantity: 4 },
        { recipeId: 30, refType: "item", refId: 6, quantity: 1 },
      ],
      inputs: [{ recipeId: 30, refType: "item", refId: 7, quantity: 1 }],
      refInfo: {},
    });
    expect(sg.recipesByRef["item:5"][0].outputQty).toBe(4);
    expect(sg.recipesByRef["item:6"][0].outputQty).toBe(1);
  });
});
