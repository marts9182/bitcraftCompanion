import { describe, it, expect } from "vitest";
import { mapResourceDescRow, mapEnemyDescRow, packPositions, packMobilePositions } from "./resources";

describe("mapResourceDescRow", () => {
  it("maps a live-shaped row to a catalog row", () => {
    const row = {
      id: 23, name: "Ancient Oak Tree ", description: "d", max_health: 8000,
      tier: 6, tag: "Tree", rarity: [1, {}], compendium_entry: true,
      icon_asset_name: "GeneratedIcons/Other/AncientOak",
      on_destroy_yield: [
        [6110011, 2, [0, []], [0, 0]], // typeTag 0 → item
        [1005, 1, [1, []], [0, 0]], // typeTag 1 → cargo (trunk)
      ],
      scheduled_respawn_time: 10800, not_respawning: false,
    };
    const out = mapResourceDescRow(row);
    expect(out).toMatchObject({
      id: 23, name: "Ancient Oak Tree", category: "Tree", tier: 6,
      rarity: "Common", maxHealth: 8000, respawnSeconds: 10800,
      notRespawning: false, compendiumEntry: true,
      yields: [
        { refType: "item", id: 6110011, qty: 2 },
        { refType: "cargo", id: 1005, qty: 1 },
      ],
    });
    expect(out.raw).toBe(row);
  });
});

describe("mapEnemyDescRow", () => {
  it("maps combat stats and loot", () => {
    const row = {
      enemy_type: 18, name: "Alpha Jakyl", description: "d", max_health: 280,
      min_damage: 15, max_damage: 27, armor: 700, accuracy: 325, evasion: 168,
      attack_level: 5, defense_level: 5, health_regen_quantity: 5,
      daytime_detect_range: 30, daytime_aggro_range: 15,
      nighttime_detect_range: 40, nighttime_aggro_range: 20,
      icon_address: "icons/jakyl", extracted_item_stacks: [[101, 1]],
      tier: 1, tag: "Monster", rarity: [1, {}], huntable: false,
    };
    expect(mapEnemyDescRow(row)).toMatchObject({
      enemyType: 18, name: "Alpha Jakyl", tier: 1, rarity: "Common",
      maxHealth: 280, minDamage: 15, maxDamage: 27, armor: 700,
      huntable: false, lootStacks: [[101, 1]],
    });
  });
});

describe("packPositions", () => {
  it("packs overworld rows to flat small-hex pairs, skipping other dimensions", () => {
    const rows = [
      { x: 9559, z: 12231, dimension: 1 },
      { x: 5, z: 6, dimension: 99 }, // interior — dropped
      { x: 100, z: 200, dimension: 1 },
    ];
    expect(packPositions(rows)).toEqual([9559, 12231, 100, 200]);
  });
});

describe("packMobilePositions", () => {
  it("converts milli-small-hex and groups by enemy type", () => {
    const enemyTypeByEntity = new Map([["e1", 18], ["e2", 18], ["e3", 2]]);
    const rows = [
      { entity_id: "e1", location_x: 10269000, location_z: 12504001, dimension: 1 },
      { entity_id: "e2", location_x: 1000, location_z: 2000, dimension: 5 }, // dropped
      { entity_id: "e3", location_x: 96000, location_z: 192000, dimension: 1 },
      { entity_id: "e9", location_x: 5000, location_z: 7000, dimension: 1 }, // not in map — dropped
    ];
    expect(packMobilePositions(rows, enemyTypeByEntity)).toEqual({
      "18": [10269, 12504],
      "2": [96, 192],
    });
  });
});
