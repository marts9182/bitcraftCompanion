import { describe, it, expect } from "vitest";
import { parseTrackParams, serializeTrackParams, decimate, trackColor, TRACK_COLORS } from "./tracking";

describe("track URL params", () => {
  it("parses comma lists, dropping junk", () => {
    expect(parseTrackParams({ resources: "23,51,abc", creatures: "18", regions: "7" }))
      .toEqual({ resources: [23, 51], creatures: [18], regions: [7], roads: false });
  });
  it("round-trips", () => {
    const s = { resources: [23], creatures: [], regions: [7, 9], roads: true };
    expect(parseTrackParams(serializeTrackParams(s))).toEqual(s);
  });
  it("serializes empty state to an empty object", () => {
    expect(serializeTrackParams({ resources: [], creatures: [], regions: [], roads: false })).toEqual({});
  });
});

describe("decimate", () => {
  it("returns input when under budget", () => {
    const xz = [1, 2, 3, 4];
    expect(decimate(xz, 10)).toBe(xz);
  });
  it("samples evenly to ~budget pairs, keeping pairs aligned", () => {
    const xz = Array.from({ length: 200 }, (_, i) => i); // 100 points
    const out = decimate(xz, 25);
    expect(out.length % 2).toBe(0);
    expect(out.length / 2).toBeLessThanOrEqual(26);
    expect(out.slice(0, 2)).toEqual([0, 1]);
  });
});

describe("trackColor", () => {
  it("cycles the palette by track order", () => {
    expect(trackColor(0)).toBe(TRACK_COLORS[0]);
    expect(trackColor(TRACK_COLORS.length)).toBe(TRACK_COLORS[0]);
  });
});
