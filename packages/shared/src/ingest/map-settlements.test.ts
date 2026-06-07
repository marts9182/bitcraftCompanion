import { describe, it, expect } from "vitest";
import { mapSettlements } from "./map-settlements";

const claimState = [
  // settlement (plain name)
  { entity_id: "100", owner_player_entity_id: "900", name: "Ravenmoor" },
  // landmark (coord-template name) — must be dropped
  { entity_id: "200", owner_player_entity_id: "0", name: "Ferralith Cave (N: 6836, E: 4396)" },
  // settlement with no claim_local_state — included with 0 economy
  { entity_id: "300", owner_player_entity_id: "0", name: "Far Horizon" },
];
const claimLocal = [
  {
    entity_id: "100", supplies: 1234, num_tiles: 48,
    num_tile_neighbors: 6, treasury: 5000, xp_gained_since_last_coin_minting: 777,
    supplies_purchase_threshold: 100, supplies_purchase_price: 9,
    location: [0, { x: 24594, z: 15592, dimension: 1 }],
  },
];
const settlementState = [
  { claim_entity_id: "100", empire_entity_id: "72057594000000042", can_house_empire_storehouse: true, members_donations: 333 },
];
const members = [
  { claim_entity_id: "100", player_entity_id: "900" },
  { claim_entity_id: "100", player_entity_id: "901" },
];

describe("mapSettlements", () => {
  it("keeps settlements and drops landmarks (classifyClaim)", () => {
    const rows = mapSettlements(claimState, claimLocal, settlementState, members, "7");
    expect(rows.map((r) => r.entityId).sort()).toEqual(["100", "300"]);
  });

  it("joins economy, empire link, member count, and decodes location", () => {
    const rows = mapSettlements(claimState, claimLocal, settlementState, members, "7");
    const r = rows.find((x) => x.entityId === "100")!;
    expect(r).toMatchObject({
      entityId: "100", region: "7", name: "Ravenmoor", ownerPlayerEntityId: "900",
      empireEntityId: "72057594000000042", x: 24594, z: 15592, dimension: 1,
      numTiles: 48, numTileNeighbors: 6, supplies: 1234, treasury: 5000,
      xpSinceMinting: 777,
      suppliesPurchaseThreshold: 100, suppliesPurchasePrice: 9,
      canHouseStorehouse: true, membersDonations: 333, memberCount: 2,
    });
  });

  it("includes a settlement with no claim_local_state, defaulting economy/location to 0", () => {
    const rows = mapSettlements(claimState, claimLocal, settlementState, members, "7");
    const r = rows.find((x) => x.entityId === "300")!;
    expect(r).toMatchObject({
      entityId: "300", name: "Far Horizon", ownerPlayerEntityId: null, empireEntityId: null,
      x: 0, z: 0, dimension: 0, numTiles: 0, supplies: 0, treasury: 0,
      canHouseStorehouse: false, membersDonations: 0, memberCount: 0,
    });
  });

  it("preserves big-int ids as strings and maps owner '0' to null", () => {
    const rows = mapSettlements(
      [{ entity_id: "72057594037927936", owner_player_entity_id: "0", name: "BigId Town" }],
      [], [], [], "7",
    );
    expect(rows[0]).toMatchObject({ entityId: "72057594037927936", ownerPlayerEntityId: null });
  });
});
