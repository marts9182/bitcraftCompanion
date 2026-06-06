import { describe, it, expect } from "vitest";
import {
  mapMarketOrders,
  mapMarketplaces,
  mapClosedListings,
  gameTimestampToMs,
  decodeTimestampMicros,
  PRICE_SENTINEL_CEILING,
} from "./map-market";

describe("mapMarketOrders", () => {
  it("tags side, maps price_threshold→price, preserves big-int ids as strings", () => {
    const sells = [{
      entity_id: "72057594037927936", owner_entity_id: "123", claim_entity_id: "456",
      item_id: 10, item_type: 0, price_threshold: 250, quantity: 4, timestamp: 1700000000000000, stored_coins: 0,
    }];
    const buys = [{
      entity_id: "999", owner_entity_id: "5", claim_entity_id: "456",
      item_id: 10, item_type: 0, price_threshold: 100, quantity: 2, timestamp: 1700000000000001, stored_coins: 50,
    }];
    const rows = mapMarketOrders(sells, buys, "7");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      entityId: "72057594037927936", side: "sell", itemId: 10, itemType: 0,
      claimEntityId: "456", ownerEntityId: "123", price: 250, quantity: 4, region: "7",
    });
    expect(rows[1]).toMatchObject({ side: "buy", price: 100, storedCoins: 50 });
  });

  it("skips rows with no item id", () => {
    expect(mapMarketOrders([{ entity_id: "1" }], [], "7")).toEqual([]);
  });

  it("decodes the object-form timestamp", () => {
    const rows = mapMarketOrders(
      [{ entity_id: "1", item_id: 10, item_type: 0, price_threshold: 5, quantity: 1, timestamp: { __timestamp_micros_since_unix_epoch__: "1779206819941775" } }],
      [], "7",
    );
    expect(rows[0]!.timestamp).toBe(1779206819941775);
  });
});

describe("mapMarketplaces", () => {
  it("maps building/claim/region with big-int-safe ids", () => {
    const rows = mapMarketplaces([{ building_entity_id: "72057594000000001", claim_entity_id: "8" }], "7");
    expect(rows).toEqual([{ buildingEntityId: "72057594000000001", claimEntityId: "8", region: "7" }]);
  });

  it("skips rows with no building id", () => {
    expect(mapMarketplaces([{ claim_entity_id: "8" }], "7")).toEqual([]);
  });
});

describe("mapClosedListings", () => {
  it("unpacks a keyed item_stack object", () => {
    const rows = mapClosedListings(
      [{ entity_id: "1", owner_entity_id: "2", claim_entity_id: "3", item_stack: { item_id: 10, quantity: 5, item_type: 1 }, timestamp: 1700000000000000 }],
      "7",
    );
    expect(rows).toEqual([{ entityId: "1", region: "7", itemId: 10, itemType: 1, quantity: 5, ownerEntityId: "2", claimEntityId: "3", timestamp: 1700000000000000 }]);
  });

  it("unpacks a positional item_stack array [item_id, quantity, item_type, durability]", () => {
    const rows = mapClosedListings(
      [{ entity_id: "1", owner_entity_id: "2", claim_entity_id: "3", item_stack: [10, 5, 0, 1000], timestamp: 1 }],
      "7",
    );
    expect(rows[0]).toMatchObject({ itemId: 10, quantity: 5, itemType: 0 });
  });

  it("skips listings with no item id", () => {
    expect(mapClosedListings([{ entity_id: "1", item_stack: null, timestamp: 1 }], "7")).toEqual([]);
  });

  it("decodes a real closed_listing item_stack (tagged item_type) + object timestamp", () => {
    const rows = mapClosedListings(
      [{ entity_id: "1", owner_entity_id: "2", claim_entity_id: "3", item_stack: { item_id: 77, quantity: 50, item_type: [1, {}], durability: [1, {}] }, timestamp: { __timestamp_micros_since_unix_epoch__: "1772242803974739" } }],
      "7",
    );
    expect(rows[0]).toMatchObject({ itemId: 77, quantity: 50, itemType: 1, timestamp: 1772242803974739 });
  });
});

describe("gameTimestampToMs", () => {
  it("converts SpacetimeDB microsecond timestamps to JS milliseconds", () => {
    expect(gameTimestampToMs(1700000000000000)).toBe(1700000000000);
    expect(gameTimestampToMs(null)).toBe(0);
  });
});

describe("decodeTimestampMicros", () => {
  it("reads the SpacetimeDB Timestamp object form", () => {
    expect(decodeTimestampMicros({ __timestamp_micros_since_unix_epoch__: "1779206819941775" })).toBe(1779206819941775);
  });
  it("passes through a plain numeric timestamp and defaults missing to 0", () => {
    expect(decodeTimestampMicros(1700000000000000)).toBe(1700000000000000);
    expect(decodeTimestampMicros(null)).toBe(0);
    expect(decodeTimestampMicros({})).toBe(0);
  });
});

describe("PRICE_SENTINEL_CEILING", () => {
  it("is below the observed ~429M placeholder", () => {
    expect(PRICE_SENTINEL_CEILING).toBe(400_000_000);
    expect(PRICE_SENTINEL_CEILING).toBeLessThan(429_496_736);
  });
});
