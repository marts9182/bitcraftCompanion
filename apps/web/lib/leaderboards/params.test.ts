import { describe, it, expect } from "vitest";
import { parseLeaderboardParams, SKILL_SORTS, LB_PAGE_SIZE } from "./params";

describe("parseLeaderboardParams", () => {
  it("defaults to all regions, totalXp sort, page 1", () => {
    expect(parseLeaderboardParams({})).toEqual({ region: "all", sort: "totalXp", page: 1 });
  });
  it("reads region, a valid sort, and a clamped page", () => {
    expect(parseLeaderboardParams({ region: "14", sort: "totalLevel", page: "3" })).toEqual({
      region: "14",
      sort: "totalLevel",
      page: 3,
    });
  });
  it("falls back to the default sort for an unknown sort and floors page at 1", () => {
    expect(parseLeaderboardParams({ sort: "bogus", page: "0" })).toEqual({ region: "all", sort: "totalXp", page: 1 });
  });
  it("exposes the page size and sort whitelist", () => {
    expect(LB_PAGE_SIZE).toBe(100);
    expect(SKILL_SORTS).toContain("highestLevel");
  });
});
