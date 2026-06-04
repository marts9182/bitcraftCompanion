import { describe, it, expect } from "vitest";
import { mapItemRow, mapCargoRow, mapBuildingRow } from "./map-entities";

describe("mapItemRow", () => {
  it("maps a normalized item row to a DB insert", () => {
    const raw = {
      id: 10, name: "Iron Ingot", description: "A bar.", volume: 100, durability: 0,
      icon_asset_name: "Icons/iron", tier: 3, tag: "Metal", rarity: 2, compendium_entry: true,
    };
    expect(mapItemRow(raw, "iron-ingot")).toEqual({
      id: 10, slug: "iron-ingot", name: "Iron Ingot", description: "A bar.", tier: 3,
      rarity: "Uncommon", tag: "Metal", volume: 100, durability: 0,
      iconAssetName: "Icons/iron", compendiumEntry: true, raw,
    });
  });

  it("defaults description and compendiumEntry when missing", () => {
    const raw = { id: 1, name: "X", rarity: 0 };
    const out = mapItemRow(raw, "x");
    expect(out.description).toBe("");
    expect(out.compendiumEntry).toBe(true);
  });
});

describe("mapCargoRow", () => {
  it("maps a normalized cargo row", () => {
    const raw = { id: 5, name: "Log", description: "", volume: 600, tier: 1, tag: "Wood", rarity: 1, icon_asset_name: "Icons/log" };
    expect(mapCargoRow(raw, "log")).toMatchObject({ id: 5, slug: "log", name: "Log", tier: 1, rarity: "Common", tag: "Wood" });
  });
});

describe("mapBuildingRow", () => {
  it("maps a normalized building row", () => {
    const raw = { id: 7, name: "Kiln", description: "Smelts.", show_in_compendium: true, functions: [{ a: 1 }] };
    const out = mapBuildingRow(raw, "kiln");
    expect(out).toMatchObject({ id: 7, slug: "kiln", name: "Kiln", showInCompendium: true });
    expect(out.functions).toEqual([{ a: 1 }]);
  });
});
