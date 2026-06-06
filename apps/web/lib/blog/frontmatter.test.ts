import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

const base = { title: "T", description: "D", date: "2026-06-01" };

describe("parseFrontmatter", () => {
  it("accepts valid frontmatter and applies defaults", () => {
    expect(parseFrontmatter(base)).toEqual({
      title: "T",
      description: "D",
      date: "2026-06-01",
      tags: [],
      author: "BitCraft Companion",
      draft: false,
    });
  });

  it("keeps provided tags/author/draft/cover", () => {
    const fm = parseFrontmatter({ ...base, tags: ["guide"], author: "Me", draft: true, cover: "/c.png" });
    expect(fm.tags).toEqual(["guide"]);
    expect(fm.author).toBe("Me");
    expect(fm.draft).toBe(true);
    expect(fm.cover).toBe("/c.png");
  });

  it("throws when a required field is missing", () => {
    expect(() => parseFrontmatter({ description: "D", date: "2026-06-01" })).toThrow(/title/);
  });

  it("throws on an unparseable date", () => {
    expect(() => parseFrontmatter({ ...base, date: "not-a-date" })).toThrow(/date/);
  });
});
