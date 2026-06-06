import { describe, it, expect } from "vitest";
import {
  mapSkillRow,
  mapExperienceRows,
  buildPlayerRows,
  mapEmpireData,
  mapClaimRows,
} from "./map-leaderboards";

describe("mapSkillRow", () => {
  it("maps id/name/maxLevel", () => {
    expect(mapSkillRow({ id: 5, name: "Mining", skill_category: "Profession", max_level: 120 })).toEqual({
      id: 5,
      name: "Mining",
      category: "Profession",
      maxLevel: 120,
    });
  });
});

describe("mapExperienceRows", () => {
  it("unnests positional stacks into per-skill rows with computed level", () => {
    const rows = mapExperienceRows([{ entity_id: "42", experience_stacks: [[5, 520], [6, 0]] }], "1");
    expect(rows).toEqual([
      { playerEntityId: "42", skillId: 5, region: "1", xp: 520, level: 2 },
      { playerEntityId: "42", skillId: 6, region: "1", xp: 0, level: 1 },
    ]);
  });
  it("unnests keyed stacks too and skips stacks with no skill id", () => {
    const rows = mapExperienceRows([{ entity_id: "7", experience_stacks: [{ skill_id: 3, quantity: 1100 }, { quantity: 5 }] }], "2");
    expect(rows).toEqual([{ playerEntityId: "7", skillId: 3, region: "2", xp: 1100, level: 3 }]);
  });
});

describe("buildPlayerRows", () => {
  it("merges username + state + online presence by entity id", () => {
    const rows = buildPlayerRows(
      [{ entity_id: "1", username: "Alice" }, { entity_id: "2", username: "Bob" }],
      [{ entity_id: "1", time_played: 3600, signed_in: true }],
      [{ entity_id: "1" }],
      "1",
    );
    expect(rows).toEqual([
      { entityId: "1", region: "1", username: "Alice", timePlayed: 3600, signedIn: true },
      { entityId: "2", region: "1", username: "Bob", timePlayed: 0, signedIn: false },
    ]);
  });
});

describe("mapEmpireData", () => {
  it("derives member count and leader (lowest rank)", () => {
    const { empires, members } = mapEmpireData(
      [{ entity_id: "100", name: "Vanguard", num_claims: 4, shard_treasury: 999 }],
      [
        { entity_id: "1", empire_entity_id: "100", rank: 2 },
        { entity_id: "2", empire_entity_id: "100", rank: 0 },
      ],
      "1",
    );
    expect(members).toHaveLength(2);
    expect(empires).toEqual([
      {
        entityId: "100",
        region: "1",
        name: "Vanguard",
        numClaims: 4,
        treasury: 999,
        leaderPlayerEntityId: "2",
        memberCount: 2,
      },
    ]);
  });
});

describe("mapClaimRows", () => {
  it("maps claims and nulls out the zero owner", () => {
    expect(mapClaimRows([{ entity_id: "9", name: "Keep", owner_player_entity_id: "0" }], "1")).toEqual([
      { entityId: "9", region: "1", name: "Keep", ownerPlayerEntityId: null },
    ]);
  });
});
