import { describe, it, expect } from "vitest";
import { normalizeRow } from "./normalize-row";

describe("normalizeRow", () => {
  it("zips a positional array with the column order", () => {
    const cols = ["id", "name", "tier"];
    expect(normalizeRow(cols, [5, "Iron", 3])).toEqual({ id: 5, name: "Iron", tier: 3 });
  });

  it("passes through an already-keyed object", () => {
    const cols = ["id", "name"];
    expect(normalizeRow(cols, { id: 1, name: "Stone" })).toEqual({ id: 1, name: "Stone" });
  });

  it("fills missing trailing array fields with undefined", () => {
    const cols = ["id", "name", "tier"];
    expect(normalizeRow(cols, [5, "Iron"])).toEqual({ id: 5, name: "Iron", tier: undefined });
  });
});
