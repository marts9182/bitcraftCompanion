import "server-only";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { parseFrontmatter } from "./frontmatter";
import {
  readingTimeMinutes,
  slugFromFilename,
  excludeDrafts,
  sortByDateDesc,
  groupByTag,
  type PostMeta,
} from "./posts-util";

const BLOG_DIR = join(process.cwd(), "content", "blog");

interface RawPost {
  meta: PostMeta;
  body: string;
}

function readAll(): RawPost[] {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
    .map((file) => {
      const { content, data } = matter(readFileSync(join(BLOG_DIR, file), "utf8"));
      const frontmatter = parseFrontmatter(data);
      return {
        meta: { slug: slugFromFilename(file), frontmatter, readingTime: readingTimeMinutes(content) },
        body: content,
      };
    });
}

/** All published posts, newest first. */
export function getAllPosts(): PostMeta[] {
  return sortByDateDesc(excludeDrafts(readAll().map((p) => p.meta)));
}

/** A single published post (frontmatter + raw MDX body), or null. */
export function getPost(slug: string): RawPost | null {
  const found = readAll().find((p) => p.meta.slug === slug && !p.meta.frontmatter.draft);
  return found ?? null;
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((p) => p.slug);
}

export function getAllTags(): string[] {
  return [...groupByTag(getAllPosts()).keys()].sort();
}

export function getPostsByTag(tag: string): PostMeta[] {
  return groupByTag(getAllPosts()).get(tag) ?? [];
}
