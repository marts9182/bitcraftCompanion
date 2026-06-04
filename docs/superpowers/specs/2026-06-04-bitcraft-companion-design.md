# BitCraft Companion — Design Spec

- **Date:** 2026-06-04
- **Status:** Approved (design); pending implementation plan
- **Scope of this spec:** Phase 0 (Foundation) + Phase 1 (Compendium MVP) in detail. Later phases are roadmap-level only.
- **Repo:** https://github.com/marts9182/bitcraftCompanion (public)

## 1. Goal

Build the go-to companion website for BitCraft Online — aiming to be an order of magnitude better than the reference site (bitjita.com): faster, cleaner, more authoritative, with first-class blogs/how-tos and genuine community participation. The site must rank and be cited (SEO + AEO), feel premium ("$10k site"), be secure in a public repo, and **never affect the live game**.

## 2. Hard requirements

1. **Do not affect the game.** All game access is read-only. The ingestion client subscribes to tables and never calls reducers (the only mechanism that mutates game state). One controlled, shared connection — never one-per-visitor.
2. **Secure public repo.** No secret may ever be committed. Credentials (SpacetimeDB identity/token, DB URL, OAuth secrets) live only in `.env.local`, used server-side only, never shipped to the browser. CI secret scanning + push protection + pre-commit hook enforce this.
3. **Fast & clean.** Pre-rendered, locally-cached data; excellent Core Web Vitals; minimal client JS.
4. **SEO/AEO best-in-class.** Every entity and article is a crawlable, structured, citable URL.

## 3. Architecture

```
  Game's SpacetimeDB  ──(read-only WebSocket subscribe)──▶  Ingestion Worker (TS, 24/7)
                                                                  │ writes
                                                                  ▼
                                                            Postgres (our DB)
                                                       (game cache + content + community)
                                                                  ▲ reads
                                                                  │
   Visitors ──▶  Next.js (Vercel)  ──(server-side queries)────────┘
                 SSG/ISR pages + API routes + MDX blog
```

- **Ingestion Worker** is the *only* component that touches the game. It holds one shared subscription, normalizes records, and upserts into Postgres. Long-running (cannot be serverless — persistent WebSocket).
- **Frontend (Next.js)** never connects to the game. It reads only our Postgres. This delivers speed (local, cached data) and safety (one controlled connection, not per-visitor load on the game).
- **Postgres** is the single source of truth the site serves from, plus content and community data.

### Data flow

1. Worker connects to the game's SpacetimeDB with the dev identity/token (server-side secret).
2. Worker subscribes to needed tables, receives initial snapshot + incremental updates.
3. Worker upserts normalized rows into Postgres and records an `ingestion_runs` audit row.
4. Next.js renders SSG/ISR pages and API routes from Postgres.

## 4. Components (pnpm monorepo)

- `apps/web` — Next.js (App Router, TypeScript): public pages, blog, API routes, admin.
- `apps/worker` — long-running SpacetimeDB client + scheduled jobs (snapshots, rollups).
- `packages/shared` — generated SpacetimeDB bindings, Zod/TS domain types, Drizzle schema + query helpers.
- `packages/content` — MDX blog/guides + typed frontmatter schema + custom MDX components.

Rationale: one language (TypeScript) end-to-end, shared types, atomic commits, clean and independently testable boundaries without multi-repo overhead.

## 5. Technology choices

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Best-in-class SSR/SSG/ISR for SEO/AEO; MDX; image optimization; large ecosystem. |
| Language | TypeScript everywhere | Single language across web + worker; shared types. |
| Ingestion | SpacetimeDB official TS SDK | Same language as the rest; official support. |
| Database | Postgres (Neon or Supabase) | Relational fit for normalized game data; managed free tier to start. |
| ORM | Drizzle | Type-safe, lightweight, SQL-first; parameterized queries. |
| Styling/UI | Tailwind CSS + shadcn/ui | Consistent, polished, accessible component system. |
| Content | MDX in `packages/content` | Free, versioned, fast, SEO-friendly; live-data MDX components. |
| Auth (later) | Auth.js (Discord + Google) | Standard OAuth; community accounts. |
| Hosting | Vercel (web) + Railway/Fly.io (worker) + Neon/Supabase (DB) | Lean managed (~$5–20/mo), scalable later. |

## 6. "Do not affect the game" safeguards

- **Subscribe-only.** Worker never calls reducers. Only read subscriptions are issued.
- **Scoped subscriptions.** Subscribe only to the tables/columns we need.
- **One shared connection.** Never per-visitor. Exponential backoff on reconnect; jittered retries.
- **Kill switch.** An env flag (e.g. `INGESTION_ENABLED=false`) pauses ingestion instantly.
- **Polite identification.** Set a descriptive User-Agent / app identifier.
- **Respect upstream guidance.** Follow any rate/etiquette rules from the trinit.is and SpacetimeDB/Clockwork Labs docs (to be confirmed during the connection spike).

## 7. Security model (public repo)

- **Secrets in `.env.local` only** (gitignored). A committed **`.env.example`** documents every key with placeholder values and comments.
- **Server-side only.** The identity/token and all secrets are read server-side (worker + Next.js server). Never exposed to the browser. In Next.js, only `NEXT_PUBLIC_*` variables reach the client; secrets will never use that prefix.
- **Defense against accidental commit:** gitleaks scan in CI, GitHub secret push protection enabled, and a pre-commit hook running gitleaks locally.
- **App security:** strict security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy), Zod validation on every API route, rate-limiting on community/write endpoints, parameterized queries via Drizzle, least-privilege DB credentials.
- **Process rule:** secrets are entered by the site owner directly into `.env.local`; they are never pasted into chat, issues, commits, or any tracked file.

## 8. Data model — Phase 1 (Compendium)

Postgres via Drizzle. Initial tables:

- `items`, `cargo`, `buildings`, `resources`, `creatures` — core game entities (id, name, slug, tier, rarity, category, description, icon ref, raw JSON for forward-compat).
- `skills` — professions/adventure skills.
- `recipes` with `recipe_inputs` and `recipe_outputs` join tables (quantities, required building/skill/tier).
- `ingestion_runs` — audit (started_at, finished_at, status, rows_upserted, error).
- `raw_snapshots` — raw payloads keyed by table+entity for resilience and reprocessing.

Content/community tables (`users`, `posts`, `comments`, `votes`, `guide_submissions`) are introduced in their later phases.

## 9. SEO / AEO strategy

- **SSG/ISR** for every entity and article: unique `<title>`, meta description, Open Graph/Twitter cards, canonical URLs.
- **Structured data (JSON-LD):** `Article` (blogs), `HowTo` (guides), `BreadcrumbList`, `FAQPage`, `ItemList` (DB listings). Drives rich results and AEO citation.
- **Crawlability:** auto-generated `sitemap.xml`, `robots.txt`, semantic HTML, descriptive internal linking (guides ↔ data pages).
- **AEO:** an `llms.txt` and clean, machine-readable pages so AI answer engines can cite the site.
- **Performance as SEO:** strong Core Web Vitals via image optimization, minimal JS, edge caching.

## 10. Content system (blog / how-tos)

- MDX files in `packages/content` with a typed frontmatter schema: `title`, `description`, `tags`, `author`, `date`, `cover`, `canonical`.
- Custom MDX components (callouts, item cards, recipe embeds) that can render **live** data from our Postgres.
- Tag/category taxonomy, RSS feed, reading time, related posts.

## 11. Community features (phased)

- **Phase A:** accounts (Discord + Google via Auth.js) + profiles; optional link to in-game player.
- **Phase B:** comments + voting/feedback (report data issues, suggest features) with moderation.
- **Phase C:** community-submitted guides with draft → review → publish workflow (owner approval).

## 12. Aesthetic direction (high level)

Premium, game-flavored, dark-first theme. Clean typographic scale, generous spacing, consistent shadcn/ui components, tasteful and sparing motion (Framer Motion), fully responsive, accessible (WCAG AA). Detailed mockups/branding are produced in the frontend-design phase of the Phase 1 build, where a visual companion will be used to compare layouts. The premium feel comes from spacing, consistency, fast interactions, and dense data presented cleanly.

## 13. Roadmap / phasing

- **Phase 0 — Foundation** *(this spec)*: monorepo scaffold; CI + secret scanning + pre-commit hook; `.gitignore` + `.env.example`; Postgres + Drizzle setup; SpacetimeDB connection spike proving read-only subscribe works; base Next.js shell + design system.
- **Phase 1 — Compendium MVP** *(this spec)*: ingest core game data → searchable items/recipes/entities DB with full SEO (SSG/ISR + JSON-LD + sitemap).
- **Phase 2 — Blog/Guides:** MDX content system + AEO polish (`llms.txt`, structured data).
- **Phase 3 — Accounts + community:** auth, comments, voting/feedback.
- **Phase 4+ — Market & economy, leaderboards, interactive map, calculators.**

Each phase gets its own spec → plan → build cycle.

## 14. Open items / next steps (not blocking this spec)

- **Branding:** confirm "BitCraft Companion" name + check domain availability; brainstorm alternates if needed.
- **Connection details:** obtain/confirm the game's SpacetimeDB host URI + module/database name (from trinit.is docs and dev access) during the Phase 0 connection spike.
- **Legal/attribution:** add "not affiliated with Clockwork Labs" disclaimer; review any data-use/ToS guidance.

## 15. Out of scope (for now)

- Calling any reducer or any write to the game.
- Per-visitor connections to the game.
- Market/economy, leaderboards, interactive map, calculators (Phase 4+).
- Headless or DB-backed CMS (MDX is the chosen content path for the foreseeable future).
