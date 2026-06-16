import { describe, it, expect } from "vitest";
import { parseParams } from "@/lib/map/region-params";

describe("parseParams", () => {
  it("accepts a known region and positive id", () => {
    expect(parseParams("7", "23")).toEqual({ ok: true, region: 7, id: 23 });
  });

  it("rejects an unknown region", () => {
    expect(parseParams("5", "23")).toEqual({ ok: false });
  });

  it("rejects a non-numeric region or id", () => {
    expect(parseParams("abc", "23")).toEqual({ ok: false });
    expect(parseParams("7", "x")).toEqual({ ok: false });
  });

  it("rejects a non-positive id", () => {
    expect(parseParams("7", "0")).toEqual({ ok: false });
    expect(parseParams("7", "-3")).toEqual({ ok: false });
  });
});
