import { describe, it, expect } from "vitest";
import { empireTerritoryOutlines } from "./territory";

describe("empireTerritoryOutlines", () => {
  it("outlines a single chunk with its 4 edges", () => {
    const [o] = empireTerritoryOutlines([{ x: 5, z: 7, empire: "A" }]);
    expect(o.empire).toBe("A");
    expect(o.chunks).toBe(1);
    expect(o.segments).toHaveLength(4);
    expect(o.centroidX).toBe(5);
    expect(o.centroidZ).toBe(7);
  });

  it("drops the shared edge between two same-empire chunks (perimeter only)", () => {
    // two horizontally adjacent chunks → 6 boundary edges (not 8)
    const [o] = empireTerritoryOutlines([
      { x: 0, z: 0, empire: "A" },
      { x: 1, z: 0, empire: "A" },
    ]);
    expect(o!.segments).toHaveLength(6);
    expect(o!.centroidX).toBe(0.5);
    expect(o!.centroidZ).toBe(0);
  });

  it("keeps the edge between two DIFFERENT empires (each draws its own)", () => {
    const outs = empireTerritoryOutlines([
      { x: 0, z: 0, empire: "A" },
      { x: 1, z: 0, empire: "B" },
    ]);
    const a = outs.find((o) => o.empire === "A")!;
    const b = outs.find((o) => o.empire === "B")!;
    expect(a.segments).toHaveLength(4);
    expect(b.segments).toHaveLength(4);
  });

  it("groups multiple empires independently", () => {
    const outs = empireTerritoryOutlines([
      { x: 0, z: 0, empire: "A" },
      { x: 0, z: 1, empire: "A" },
      { x: 9, z: 9, empire: "B" },
    ]);
    expect(outs).toHaveLength(2);
    expect(outs.find((o) => o.empire === "A")!.chunks).toBe(2);
    expect(outs.find((o) => o.empire === "B")!.chunks).toBe(1);
  });
});
