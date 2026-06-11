import { describe, it, expect } from "vitest";
import { findNearestPoint, type DrawnTrack } from "./hit-test";

// Identity projection: treat small-hex (x, z) directly as container px (x, y).
const id = (x: number, z: number) => ({ x, y: z });
const track = (key: string, xz: number[]): DrawnTrack => ({ key, color: "#fff", name: key, xz });

describe("findNearestPoint", () => {
  it("returns null when nothing is drawn", () => {
    expect(findNearestPoint([], 10, 10, id, 8)).toBeNull();
    expect(findNearestPoint([track("a", [])], 10, 10, id, 8)).toBeNull();
  });

  it("hits a point within the radius and reports its coords + track", () => {
    const t = track("iron", [100, 200]);
    expect(findNearestPoint([t], 103, 204, id, 8)).toEqual({ track: t, x: 100, z: 200 }); // 5px away
  });

  it("misses points beyond the radius", () => {
    expect(findNearestPoint([track("a", [100, 200])], 106, 206, id, 8)).toBeNull(); // ~8.49px
  });

  it("includes points exactly at the radius", () => {
    expect(findNearestPoint([track("a", [100, 200])], 108, 200, id, 8)).not.toBeNull(); // 8px
  });

  it("nearest wins across tracks and within a track", () => {
    const a = track("a", [0, 0, 100, 100]); // (100,100) is 5.1px from the click
    const b = track("b", [104, 100]); // 1px from the click
    const hit = findNearestPoint([a, b], 105, 100, id, 8);
    expect(hit?.track.key).toBe("b");
    expect(hit).toMatchObject({ x: 104, z: 100 });
  });

  it("first candidate wins an exact distance tie", () => {
    const a = track("a", [100, 100]);
    const b = track("b", [110, 100]); // both 5px from the click at (105,100)
    expect(findNearestPoint([a, b], 105, 100, id, 8)?.track.key).toBe("a");
  });

  it("applies the injected projection (small-hex points, pixel click)", () => {
    // Mimic the layer: small-hex -> chunk (/96), drawn at 1px per chunk.
    const project = (x: number, z: number) => ({ x: x / 96, y: z / 96 });
    const t = track("a", [9600, 19200]); // chunk (100, 200)
    expect(findNearestPoint([t], 101, 201, project, 8)).toMatchObject({ x: 9600, z: 19200 });
  });

  it("ignores a dangling unpaired trailing value", () => {
    const t = track("a", [100, 200, 999]);
    expect(findNearestPoint([t], 100, 200, id, 8)).toMatchObject({ x: 100, z: 200 });
  });
});
