import { describe, it, expect } from "vitest";
import { mapRegionEvent, spacetimeMicrosToDate, HEXITE_SEALED_VAULT } from "./region-events";

describe("spacetimeMicrosToDate", () => {
  it("decodes the Timestamp product shape (micros since epoch)", () => {
    const d = spacetimeMicrosToDate({ __timestamp_micros_since_unix_epoch__: "1781593223181548" });
    expect(d?.getTime()).toBe(1781593223181); // micros -> ms (floored)
  });
  it("accepts a raw numeric micros value and rejects junk", () => {
    expect(spacetimeMicrosToDate(1781593223181548)?.getTime()).toBe(1781593223181);
    expect(spacetimeMicrosToDate(null)).toBeNull();
    expect(spacetimeMicrosToDate("nope")).toBeNull();
  });
});

describe("mapRegionEvent", () => {
  const growth = [
    { entity_id: "216172782117381329", end_timestamp: { __timestamp_micros_since_unix_epoch__: "1781593223181548" }, growth_recipe_id: 1633012503 },
    { entity_id: "999", end_timestamp: { __timestamp_micros_since_unix_epoch__: "1781600000000000" }, growth_recipe_id: 1633012503 },
  ];
  const location = [{ entity_id: "216172782117381329", chunk_index: 43204, x: 19492, z: 4134, dimension: 1 }];

  it("picks the soonest growth and joins its location", () => {
    const r = mapRegionEvent(growth, location, "3");
    expect(r).toEqual({
      region: "3",
      eventType: HEXITE_SEALED_VAULT,
      endsAt: new Date(1781593223181),
      entityId: "216172782117381329",
      x: 19492,
      z: 4134,
      dimension: 1,
    });
  });

  it("returns coords null when no location row matches, but still maps the time", () => {
    const r = mapRegionEvent(growth, [], "3");
    expect(r?.x).toBeNull();
    expect(r?.endsAt).toEqual(new Date(1781593223181));
  });

  it("returns null when there are no growth rows", () => {
    expect(mapRegionEvent([], location, "3")).toBeNull();
  });
});
