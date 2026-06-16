import { describe, it, expect } from "vitest";
import { pickNextEvent, type StoredEvent } from "./region-events";

const base: StoredEvent = { region: "3", eventType: "hexite_sealed_vault", endsAt: 0, x: 19492, z: 4134, dimension: 1 };
const at = (iso: string, region: string): StoredEvent => ({ ...base, region, endsAt: Date.parse(iso) });
const NOW = Date.parse("2026-06-15T12:00:00Z");

describe("pickNextEvent", () => {
  it("returns the soonest FUTURE event across regions as 'upcoming'", () => {
    const rows = [at("2026-06-15T20:00:00Z", "11"), at("2026-06-15T14:00:00Z", "3"), at("2026-06-16T02:00:00Z", "15")];
    const r = pickNextEvent(rows, NOW);
    expect(r?.region).toBe("3");
    expect(r?.state).toBe("upcoming");
  });

  it("treats a just-passed event (within the live window) as 'live'", () => {
    const r = pickNextEvent([at("2026-06-15T11:50:00Z", "3")], NOW);
    expect(r?.state).toBe("live");
  });

  it("ignores events older than the live window", () => {
    expect(pickNextEvent([at("2026-06-15T10:00:00Z", "3")], NOW)).toBeNull();
  });

  it("prefers an upcoming event over a live one when both exist", () => {
    const r = pickNextEvent([at("2026-06-15T11:55:00Z", "3"), at("2026-06-15T18:00:00Z", "11")], NOW);
    expect(r?.region).toBe("11");
    expect(r?.state).toBe("upcoming");
  });

  it("returns null for an empty set", () => {
    expect(pickNextEvent([], NOW)).toBeNull();
  });
});
