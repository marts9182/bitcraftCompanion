import type { Frontmatter } from "./frontmatter";

export interface PostMeta {
  slug: string;
  frontmatter: Frontmatter;
  readingTime: number; // whole minutes
}

/** Estimated reading time in minutes (~200 wpm, minimum 1). */
export function readingTimeMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Drop the `.md`/`.mdx` extension to get a slug. */
export function slugFromFilename(file: string): string {
  return file.replace(/\.mdx?$/, "");
}

export function excludeDrafts(posts: PostMeta[]): PostMeta[] {
  return posts.filter((p) => !p.frontmatter.draft);
}

/** Newest first, by frontmatter date. */
export function sortByDateDesc(posts: PostMeta[]): PostMeta[] {
  return [...posts].sort((a, b) => Date.parse(b.frontmatter.date) - Date.parse(a.frontmatter.date));
}

/** Group posts by tag (a post appears under each of its tags). */
export function groupByTag(posts: PostMeta[]): Map<string, PostMeta[]> {
  const map = new Map<string, PostMeta[]>();
  for (const post of posts) {
    for (const tag of post.frontmatter.tags) {
      const list = map.get(tag);
      if (list) list.push(post);
      else map.set(tag, [post]);
    }
  }
  return map;
}
