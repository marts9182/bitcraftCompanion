import { describe, it, expect } from "vitest";
import { extractTableInserts } from "./subscription-message";

const initial = {
  InitialSubscription: {
    request_id: 1,
    database_update: {
      tables: [
        {
          table_name: "item_desc",
          updates: [{ inserts: ['{"id":1,"name":"Stone"}', '{"id":2,"name":"Wood"}'] }],
        },
        { table_name: "cargo_desc", updates: [{ inserts: ['{"id":9,"name":"Log"}'] }] },
      ],
    },
  },
};

describe("extractTableInserts", () => {
  it("returns parsed rows grouped by table name", () => {
    const out = extractTableInserts(initial);
    expect(out.get("item_desc")).toEqual([{ id: 1, name: "Stone" }, { id: 2, name: "Wood" }]);
    expect(out.get("cargo_desc")).toEqual([{ id: 9, name: "Log" }]);
  });

  it("parses the modern SubscribeMultiApplied reply shape", () => {
    const msg = {
      SubscribeMultiApplied: {
        request_id: 1,
        query_id: { id: 1 },
        update: {
          tables: [
            { table_name: "item_desc", updates: [{ inserts: ['{"id":1,"name":"Stone"}'] }] },
          ],
        },
      },
    };
    expect(extractTableInserts(msg).get("item_desc")).toEqual([{ id: 1, name: "Stone" }]);
  });

  it("returns an empty map for non-subscription messages", () => {
    expect(extractTableInserts({ IdentityToken: {} }).size).toBe(0);
  });

  it("skips a malformed insert while keeping valid ones", () => {
    const msg = {
      InitialSubscription: {
        database_update: {
          tables: [{ table_name: "t", updates: [{ inserts: ['{"id":1}', "not json", '{"id":2}'] }] }],
        },
      },
    };
    expect(extractTableInserts(msg).get("t")).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("merges inserts across multiple update groups for one table", () => {
    const msg = {
      InitialSubscription: {
        database_update: {
          tables: [{ table_name: "t", updates: [{ inserts: ['{"a":1}'] }, { inserts: ['{"a":2}'] }] }],
        },
      },
    };
    expect(extractTableInserts(msg).get("t")).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
