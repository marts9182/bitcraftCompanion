import { describe, it, expect } from "vitest";
import {
  readingTimeMinutes,
  slugFromFilename,
  excludeDrafts,
  sortByDateDesc,
  groupByTag,
  type PostMeta,
} from "./posts-util";
import type { Frontmatter } from "./frontmatter";

function post(slug: string, over: Partial<Frontmatter> = {}): PostMeta {
  return {
    slug,
    readingTime: 1,
    frontmatter: {
      title: slug,
      description: "d",
      date: "2026-01-01",
      tags: [],
      author: "a",
      draft: false,
      ...over,
    },
  };
}

describe("readingTimeMinutes", () => {
  it("is at least 1 minute", () => {
    expect(readingTimeMinutes("a few words")).toBe(1);
  });
  it("scales ~200 wpm", () => {
    expect(readingTimeMinutes(Array(400).fill("word").join(" "))).toBe(2);
  });
});

describe("slugFromFilename", () => {
  it("strips .mdx and .md", () => {
    expect(slugFromFilename("hello.mdx")).toBe("hello");
    expect(slugFromFilename("hello.md")).toBe("hello");
  });
});

describe("excludeDrafts", () => {
  it("removes draft posts", () => {
    const out = excludeDrafts([post("a"), post("b", { draft: true })]);
    expect(out.map((p) => p.slug)).toEqual(["a"]);
  });
});

describe("sortByDateDesc", () => {
  it("orders newest first without mutating the input", () => {
    const input = [post("old", { date: "2025-01-01" }), post("new", { date: "2026-01-01" })];
    const out = sortByDateDesc(input);
    expect(out.map((p) => p.slug)).toEqual(["new", "old"]);
    expect(input.map((p) => p.slug)).toEqual(["old", "new"]);
  });
});

describe("groupByTag", () => {
  it("indexes posts under each of their tags", () => {
    const g = groupByTag([post("a", { tags: ["x", "y"] }), post("b", { tags: ["x"] })]);
    expect(g.get("x")!.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(g.get("y")!.map((p) => p.slug)).toEqual(["a"]);
  });
});
