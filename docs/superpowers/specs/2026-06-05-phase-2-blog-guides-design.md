# Phase 2 — Blog / Guides (MDX) MVP

**Date:** 2026-06-05
**Status:** Approved-by-delegation (owner asked to proceed through Phase 2 while away,
"follow all best practices"). Lands on `main`.

## Goal

An MDX-based content system for blog posts and how-to guides, with typed frontmatter,
tag taxonomy, reading time, RSS, SEO (Article JSON-LD), and custom MDX components that can
embed **live compendium data** (the differentiator vs. a plain blog). Ship a working MVP
with seed content; richer authoring features are follow-ups.

Refines the parent spec `2026-06-04-bitcraft-companion-design.md` §10 (content system).

## Scope

**In scope:**
- MDX content in `apps/web/content/blog/*.mdx` with zod-validated frontmatter.
- `/blog` (index), `/blog/[slug]` (post), `/blog/tags/[tag]` (tag listing).
- `/feed.xml` RSS feed.
- Custom MDX components: `Callout` (info/warn) and `ItemCard` (async server component that
  fetches an item by slug from Postgres — demonstrates live data; graceful fallback).
- Reading time, post sorting (newest first), draft exclusion, tag grouping.
- "Blog" added to the global nav; sitemap + SEO (metadata + Article/Breadcrumb JSON-LD).
- 2 seed posts (one how-to using the components, one announcement).
- Prose styling via `@tailwindcss/typography`.

**Out of scope (noted follow-ups):**
- Moving content to a shared `packages/content` (co-located in `apps/web` for the MVP).
- Authoring workflow, MDX recipe/graph embeds beyond `ItemCard`, related posts, search,
  pagination of the blog index, author pages, per-post OG image generation.

## Tech choices (decisions)

- **MDX rendering:** `next-mdx-remote` (`compileMDX` from `next-mdx-remote/rsc`) — RSC-native,
  supports a content collection read from the filesystem + custom components + async embeds.
  Fallback if incompatible with Next 16/Turbopack: `@mdx-js/mdx` `evaluate`, or `@next/mdx`.
- **Frontmatter:** `gray-matter` to split frontmatter, `zod` to validate.
- **Styling:** `@tailwindcss/typography` via `@plugin "@tailwindcss/typography";` in
  `globals.css` (Tailwind v4 plugin syntax).
- Content is read at build/ISR time (Server Components); never shipped to the client.

## Architecture

### Content & frontmatter
`apps/web/content/blog/<slug>.mdx`. Frontmatter schema (`apps/web/lib/blog/frontmatter.ts`,
pure, zod):
```
title: string
description: string
date: string  (ISO date; validated parseable)
tags: string[] = []
author: string = "BitCraft Companion"
draft: boolean = false
cover?: string
```
`parseFrontmatter(raw): Frontmatter` throws on invalid (fail the build loudly).

### Pure helpers (`apps/web/lib/blog/posts-util.ts`, unit-tested)
- `readingTimeMinutes(markdown: string): number` (≈200 wpm, min 1).
- `sortByDateDesc(posts)`; `excludeDrafts(posts)`; `groupByTag(posts) → Map<tag, posts>`;
  `slugFromFilename(file)`.
These operate on a `PostMeta` shape (`{ slug, frontmatter, readingTime }`) so they're pure
and testable without the filesystem.

### Content access (`apps/web/lib/blog/posts.ts`, server-only)
- `getAllPosts(): PostMeta[]` — read `content/blog/*.mdx`, parse+validate frontmatter, compute
  reading time, exclude drafts, sort newest first.
- `getPost(slug): { meta, body } | null` — frontmatter + raw MDX body for rendering.
- `getAllTags(): string[]`; `getPostsByTag(tag): PostMeta[]`; `getAllSlugs()`.
- Uses `node:fs`/`node:path`; reads from `process.cwd()/content/blog` (or a module-relative
  path resolved once).

### MDX components (`apps/web/components/blog/`)
- `Callout.tsx` — `{ type?: "info" | "warn"; children }` styled box.
- `ItemCard.tsx` — async server component: `{ slug: string }` → `getItemBySlug(slug)` from
  `@/lib/queries/items`; renders an `EntityIcon` + name + tier/rarity linking to `/items/<slug>`;
  if missing, renders a subtle "unknown item" chip. Demonstrates live data in MDX.
- `mdx-components.tsx` — the components map passed to `compileMDX` (`Callout`, `ItemCard`, and
  link/heading overrides as needed).

### Routes (Server Components, ISR `revalidate = 3600`)
- `app/blog/page.tsx` — list posts (title, date, reading time, tags), metadata, ItemList +
  Breadcrumb JSON-LD.
- `app/blog/[slug]/page.tsx` — `generateStaticParams` over slugs; `generateMetadata`
  (title/description/canonical/OG, `type: "article"`); render via `compileMDX` with the
  components map; Article + Breadcrumb JSON-LD; prose container; `notFound()` on unknown slug.
- `app/blog/tags/[tag]/page.tsx` — posts for a tag; `generateStaticParams` over tags.
- `app/feed.xml/route.ts` — RSS 2.0 of the latest posts (text/xml), built from `getAllPosts`.

### Cross-cutting
- `layout.tsx` nav: add `["/blog", "Blog"]`.
- `sitemap.ts`: add `/blog`, each post, each tag page.
- `globals.css`: add the typography plugin; wrap post body in `prose dark:prose-invert`.

## SEO / AEO
- Per-post `generateMetadata` (canonical, OG `type:"article"`, published time).
- JSON-LD `Article` (headline, datePublished, author, description) + `BreadcrumbList`; `ItemList`
  on the index. Embedded via `jsonLdScript` (escaped).
- RSS at `/feed.xml`; sitemap covers blog routes; `llms.txt` updated to list `/blog`.

## Error handling
- Invalid frontmatter → throw at read time (build fails loudly — surfaces bad content).
- Unknown post/tag slug → `notFound()`. `ItemCard` with a bad slug → graceful chip, no throw.

## Testing
- Unit (`.test.ts`, node env, pure): `parseFrontmatter` (valid; missing required → throws;
  draft default; tags default; bad date → throws); `readingTimeMinutes`; `sortByDateDesc`;
  `excludeDrafts`; `groupByTag`; `slugFromFilename`.
- Typecheck + bundle-safety grep.
- Runtime smoke: `/blog` lists seed posts; a post renders MDX incl. a live `ItemCard`; a tag
  page lists; `/feed.xml` returns valid RSS; nav shows Blog; unknown slug → 404.

## Delivery
Lands on `main`, tests green, pushed. If `next-mdx-remote` proves incompatible with Next 16,
switch to the `@mdx-js/mdx evaluate` fallback (same component map + frontmatter pipeline) and
note it.
