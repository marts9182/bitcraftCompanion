import { describe, it, expect } from "vitest";
import { mapClaimLocalRows, mapChunkRows, mapRegionRows, buildEmpireColors } from "./map-world";

describe("mapClaimLocalRows", () => {
  it("decodes location Sum + carries stats; joins names by entity id", () => {
    const rows = mapClaimLocalRows(
      [{ entity_id: "9", num_tiles: 12, treasury: 500, supplies: 3, location: [0, { x: 24594, z: 15592, dimension: 1 }] }],
      new Map([["9", "Keep"]]),
    );
    expect(rows).toEqual([
      { entityId: "9", name: "Keep", x: 24594, z: 15592, dimension: 1, numTiles: 12, treasury: 500, supplies: 3 },
    ]);
  });
  it("skips claims with no decodable location", () => {
    expect(mapClaimLocalRows([{ entity_id: "1", location: null }], new Map())).toEqual([]);
  });
});

describe("mapChunkRows", () => {
  it("maps chunk->empire, ids as strings", () => {
    expect(mapChunkRows([{ chunk_index: 301295, empire_entity_id: 123395, watchtower_entity_id: 1369094286736807700 }])).toEqual([
      { chunkIndex: "301295", empireEntityId: "123395", watchtowerEntityId: "1369094286736807700" },
    ]);
  });
  it("nulls a missing watchtower", () => {
    expect(mapChunkRows([{ chunk_index: 5, empire_entity_id: 7, watchtower_entity_id: null }])[0]!.watchtowerEntityId).toBeNull();
  });
});

describe("mapRegionRows", () => {
  it("maps region grid + name by id", () => {
    expect(mapRegionRows([{ id: 0, region_min_chunk_x: 240, region_min_chunk_z: 160, region_width_chunks: 80, region_height_chunks: 80, region_index: 14 }], new Map([[0, "Foo"]]))).toEqual([
      { id: 0, name: "Foo", minChunkX: 240, minChunkZ: 160, widthChunks: 80, heightChunks: 80, regionIndex: 14 },
    ]);
  });
});

describe("buildEmpireColors", () => {
  it("derives #rrggbb from color1_id → color_argb (ARGB 0xAARRGGBB masked to RRGGBB)", () => {
    const colors = buildEmpireColors(
      [{ id: 1, color_argb: 0xff3366cc }], // 4282384332
      [{ entity_id: 555, color1_id: 1, color2_id: 0 }],
    );
    expect(colors.get("555")).toBe("#3366cc");
  });
  it("omits an empire whose color1_id has no matching color desc", () => {
    const colors = buildEmpireColors(
      [{ id: 1, color_argb: 0xff3366cc }],
      [{ entity_id: 777, color1_id: 99 }],
    );
    expect(colors.has("777")).toBe(false);
  });
  it("zero-pads small color values", () => {
    const colors = buildEmpireColors(
      [{ id: 2, color_argb: 0x00000abc }],
      [{ entity_id: 9, color1_id: 2 }],
    );
    expect(colors.get("9")).toBe("#000abc");
  });
});
