import { describe, it, expect } from "vitest";
import { mapRecipeRow, buildRecipeGraph, refTypeOf } from "./map-recipes";

describe("refTypeOf", () => {
  it("detects cargo from a tagged sum and defaults to item", () => {
    expect(refTypeOf({ Cargo: [] })).toBe("cargo");
    expect(refTypeOf("Item")).toBe("item");
    expect(refTypeOf({ Item: [] })).toBe("item");
    expect(refTypeOf(undefined)).toBe("item");
  });

  it("detects type from a positional sum [tag, payload] (live form)", () => {
    expect(refTypeOf([0, []])).toBe("item");
    expect(refTypeOf([1, []])).toBe("cargo");
  });
});

describe("mapRecipeRow", () => {
  it("maps a crafting recipe header", () => {
    const raw = { id: 3, name: "Smelt Iron", time_requirement: 5, stamina_requirement: 1 };
    expect(mapRecipeRow(raw, "crafting", "smelt-iron")).toEqual({
      id: 3, slug: "smelt-iron", name: "Smelt Iron", type: "crafting",
      timeRequirement: 5, staminaRequirement: 1, raw,
    });
  });
});

describe("buildRecipeGraph", () => {
  it("produces input and output rows from stacks", () => {
    const raw = {
      consumed_item_stacks: [{ item_id: 1, quantity: 2, item_type: { Item: [] } }],
      crafted_item_stacks: [{ item_id: 9, quantity: 1, item_type: { Cargo: [] } }],
    };
    const { inputs, outputs } = buildRecipeGraph(3, raw);
    expect(inputs).toEqual([{ recipeId: 3, refType: "item", refId: 1, quantity: 2 }]);
    expect(outputs).toEqual([{ recipeId: 3, refType: "cargo", refId: 9, quantity: 1 }]);
  });

  it("also reads consumed_cargo_stacks (construction recipes)", () => {
    const raw = { consumed_cargo_stacks: [{ item_id: 4, quantity: 3 }] };
    const { inputs } = buildRecipeGraph(8, raw);
    expect(inputs).toContainEqual({ recipeId: 8, refType: "cargo", refId: 4, quantity: 3 });
  });

  it("returns empty arrays when no stacks present", () => {
    expect(buildRecipeGraph(1, {})).toEqual({ inputs: [], outputs: [] });
  });

  it("reads live positional stacks (arrays) with positional item_type sums", () => {
    const raw = {
      consumed_item_stacks: [[6110021, 2, [0, []], 1, 1]],
      crafted_item_stacks: [[640492469, 1, [1, []], [0, 0]]],
    };
    const { inputs, outputs } = buildRecipeGraph(7, raw);
    expect(inputs).toEqual([{ recipeId: 7, refType: "item", refId: 6110021, quantity: 2 }]);
    expect(outputs).toEqual([{ recipeId: 7, refType: "cargo", refId: 640492469, quantity: 1 }]);
  });
});
