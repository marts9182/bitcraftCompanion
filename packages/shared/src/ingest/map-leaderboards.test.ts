import { describe, it, expect } from "vitest";
import {
  mapSkillRow,
  mapExperienceRows,
  buildPlayerRows,
  mapEmpireData,
  mapClaimRows,
  usernamesById,
  onlineEntityIds,
  activeRegionIds,
  buildRegionPlayerRows,
  mapEmpireNodes,
  mapClaimMembers,
  aggregateEmpireFoundries,
} from "./map-leaderboards";

describe("activeRegionIds", () => {
  it("returns the distinct, sorted region ids that have players", () => {
    expect(
      activeRegionIds([{ region_id: 14 }, { region_id: 7 }, { region_id: 14 }, { region_id: 9 }]),
    ).toEqual([7, 9, 14]);
  });
});

describe("buildRegionPlayerRows", () => {
  it("builds region players from player_state, enriched with global username + online", () => {
    const rows = buildRegionPlayerRows(
      [{ entity_id: "100", time_played: 7483, time_signed_in: 500, sign_in_timestamp: 42 }, { entity_id: "200", time_played: 0 }],
      "14",
      usernamesById([{ entity_id: "100", username: "Alessandro" }]),
      onlineEntityIds([{ entity_id: "100" }]),
    );
    expect(rows).toEqual([
      { entityId: "100", region: "14", username: "Alessandro", timePlayed: 7483, timeSignedIn: 500, signInTimestamp: 42, signedIn: true },
      { entityId: "200", region: "14", username: "Player 200", timePlayed: 0, timeSignedIn: 0, signInTimestamp: 0, signedIn: false },
    ]);
  });
});

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
      [{ entity_id: "1", time_played: 3600, time_signed_in: 1200, sign_in_timestamp: 99, signed_in: true }],
      [{ entity_id: "1" }],
      "1",
    );
    expect(rows).toEqual([
      { entityId: "1", region: "1", username: "Alice", timePlayed: 3600, timeSignedIn: 1200, signInTimestamp: 99, signedIn: true },
      { entityId: "2", region: "1", username: "Bob", timePlayed: 0, timeSignedIn: 0, signInTimestamp: 0, signedIn: false },
    ]);
  });
});

describe("mapEmpireData", () => {
  it("derives member count, leader (lowest rank), currency + member donations", () => {
    const { empires, members } = mapEmpireData(
      [{ entity_id: "100", name: "Vanguard", num_claims: 4, shard_treasury: 999, empire_currency_treasury: 5000, nobility_threshold: 100, owner_type: 1 }],
      [
        { entity_id: "1", empire_entity_id: "100", rank: 2, donated_shards: 10, donated_empire_currency: 20, noble: false },
        { entity_id: "2", empire_entity_id: "100", rank: 0, noble: true, donated_shards: 50, donated_empire_currency: 0 },
      ],
      "1",
    );
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ donatedShards: 10, donatedCurrency: 20, noble: false });
    expect(members[1]).toMatchObject({ noble: true, donatedShards: 50 });
    expect(empires).toEqual([
      {
        entityId: "100",
        region: "1",
        name: "Vanguard",
        numClaims: 4,
        treasury: 999,
        currencyTreasury: 5000,
        nobilityThreshold: 100,
        ownerType: 1,
        leaderPlayerEntityId: "2",
        memberCount: 2,
      },
    ]);
  });
});

describe("mapEmpireNodes", () => {
  it("maps towers and aggregates count/energy/upkeep per empire", () => {
    const { towers, agg } = mapEmpireNodes(
      [
        { entity_id: "t1", empire_entity_id: "100", chunk_index: "5", energy: 30, upkeep: 2, active: true },
        { entity_id: "t2", empire_entity_id: "100", chunk_index: "6", energy: 70, upkeep: 3, active: false },
        { entity_id: "t3", empire_entity_id: "200", chunk_index: "7", energy: 10, upkeep: 1, active: true },
      ],
      "14",
    );
    expect(towers).toHaveLength(3);
    expect(towers[0]).toMatchObject({ entityId: "t1", empireEntityId: "100", region: "14", energy: 30, active: true });
    expect(agg.get("100")).toEqual({ count: 2, energy: 100, upkeep: 5 });
    expect(agg.get("200")).toEqual({ count: 1, energy: 10, upkeep: 1 });
  });
});

describe("aggregateEmpireFoundries", () => {
  it("sums hexite_capsules + queued and counts foundries per empire", () => {
    const m = aggregateEmpireFoundries([
      { entity_id: "f1", empire_entity_id: "100", hexite_capsules: 201, queued: 0 },
      { entity_id: "f2", empire_entity_id: "100", hexite_capsules: 50, queued: 3 },
      { entity_id: "f3", empire_entity_id: "200", hexite_capsules: 0, queued: 1 },
    ]);
    expect(m.get("100")).toEqual({ capsules: 251, queued: 3, count: 2 });
    expect(m.get("200")).toEqual({ capsules: 0, queued: 1, count: 1 });
  });
});

describe("mapClaimMembers", () => {
  it("maps player↔claim memberships with permission flags + claim name from the map", () => {
    const rows = mapClaimMembers(
      [{ claim_entity_id: "9", player_entity_id: "1", co_owner_permission: true, officer_permission: false, build_permission: true, inventory_permission: false }],
      "14",
      new Map([["9", "Far Horizon"]]),
    );
    expect(rows).toEqual([
      { claimEntityId: "9", playerEntityId: "1", region: "14", claimName: "Far Horizon", coOwner: true, officer: false, build: true, inventory: false },
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
