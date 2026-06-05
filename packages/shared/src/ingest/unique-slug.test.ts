import { describe, it, expect } from "vitest";
import { makeUniqueSlug } from "./unique-slug";

describe("makeUniqueSlug", () => {
  it("returns the base slug when unused", () => {
    const used = new Set<string>();
    expect(makeUniqueSlug("Iron Ingot", 10, used)).toBe("iron-ingot");
    expect(used.has("iron-ingot")).toBe(true);
  });
  it("appends the id on collision", () => {
    const used = new Set<string>(["iron-ingot"]);
    expect(makeUniqueSlug("Iron Ingot", 42, used)).toBe("iron-ingot-42");
  });
  it("uses the id when the name slugifies to empty", () => {
    const used = new Set<string>();
    expect(makeUniqueSlug("!!!", 7, used)).toBe("7");
  });
});
