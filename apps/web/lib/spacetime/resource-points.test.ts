import { describe, it, expect } from "vitest";
import { rowsToXz } from "@/lib/spacetime/resource-points";

describe("rowsToXz", () => {
  it("flattens location rows to [x,z,…] and skips malformed rows", () => {
    const rows = [
      { x: 1, z: 2, entity_id: "9", dimension: 1 },
      { x: 3, z: 4 },
      { foo: 1 }, // no x/z → skipped
      { x: 5, z: null }, // non-number z → skipped
    ];
    expect(rowsToXz(rows)).toEqual([1, 2, 3, 4]);
  });

  it("returns empty for no rows", () => {
    expect(rowsToXz([])).toEqual([]);
  });
});
