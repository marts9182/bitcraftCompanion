# Frontend Design — Foundation + Homepage (design)

**Date:** 2026-06-07
**Status:** Design / approved by user — proceeding to writing-plans
**Context:** The long-deferred "frontend-design phase" (premium dark redesign) for BitCraft Companion. The site currently renders on stock shadcn neutral-gray tokens, light-by-default (no `dark` class on `<html>`), with the brand only hand-applied to `SiteHeader`. Body text falls back to system sans (Lexend never wired). This phase establishes the global design system and a flagship homepage; per-section visual polish follows in later plans. Brand source: official bitcraftonline.com (see memory `bitcraft-brand-reference`).

---

## 1. Decisions locked (clarifying gate)

- ✅ **Scope:** Foundation (design system) + a redesigned homepage + high-quality header & footer. NOT a full per-section redesign.
- ✅ **Theme modes:** **dark default + a polished light theme** with a persisted header toggle.
- ✅ **Accent strategy:** **gold + teal duotone** — gold (`#D5BB72`) leads primary actions/active nav/key numbers; teal (`#3C7FAA`/`#15567E`) is a real second accent for links, secondary stats, info.
- ✅ **Numbers/labels:** **Lexend with `tabular-nums`** (no monospace) for stats/prices/labels.
- ✅ **Typography:** Josefin Sans (display/headings + wordmark) + Lexend (body/UI).
- ✅ **Homepage:** **Cinematic hero** — full-bleed headline + CTA over a gradient, live-stat strip, feature tiles, latest-blog row.

## 2. Scope

### In scope
- Brand design tokens in `globals.css` for both themes, reusing existing shadcn token names so all pages upgrade automatically.
- Lexend wiring + Josefin retained; heading utility.
- `next-themes` provider, `defaultTheme="dark"`, header toggle (no flash).
- High-quality **header** (refine existing → tokens + toggle) and a new **footer**.
- A small set of shared primitives: `PageHeader`, tokenized button/link styles, standardized stat-card + table-header treatments.
- Redesigned homepage (`app/page.tsx`).

### Out of scope (→ follow-on plans)
- Per-section visual polish: compendium rarity card-grids, map chrome, market/settlements/leaderboards/empires table redesigns.
- Universal search (new component) — **deferred**.
- Any new data, queries, or schema beyond reading existing counts for the homepage.

---

## 3. Design tokens (`apps/web/app/globals.css`)

Replace the stock neutral `:root` (light) and `.dark` token blocks with brand-mapped values, **keeping the shadcn variable names** (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover*`, `--primary`, `--primary-foreground`, `--secondary*`, `--muted*`, `--accent*`, `--border`, `--input`, `--ring`, `--destructive`, `--chart-1..5`). Because existing components consume these names, the whole site re-skins with no per-component edits. Values given as hex (brand-native); implementation may convert to oklch if cleaner.

### 3.1 Dark theme (`.dark`, default)
| token | value | role |
|---|---|---|
| `--background` | `#1D1B22` | deep app bg |
| `--card`, `--popover` | `#2E2B3B` | surface |
| `--secondary`, `--muted`, `--accent` | `#2E2B3B` / `#38373C` | raised surfaces |
| `--border`, `--input` | `#38373C` | hairlines |
| `--foreground`, `--card-foreground` | `#E9DFC4` | warm cream text |
| `--muted-foreground` | `#747184` | secondary text |
| `--primary` | `#D5BB72` | gold (CTAs, active nav, key numbers) |
| `--primary-foreground` | `#1D1B22` | text on gold |
| `--ring` | `#D5BB72` | focus ring |
| `--accent-teal` (new) | `#3C7FAA` | second accent (links, secondary stats) |
| `--accent-teal-strong` (new) | `#15567E` | teal fills/badges |
| `--chart-1`, `--chart-2` | `#D5BB72`, `#3C7FAA` | data series |

Hover/darker gold (`#B8932E`) used for button/link hover.

### 3.2 Light theme (`:root`)
Warm-paper, AA-tuned (gold on light is darkened; teal uses the strong/dark variant for text):
| token | value | role |
|---|---|---|
| `--background` | `#F6F2E9` | warm paper |
| `--card`, `--popover` | `#FFFFFF` | surface |
| `--secondary`, `--muted`, `--accent` | `#EFE9DA` | raised surfaces |
| `--border`, `--input` | `#E0D8C6` | hairlines |
| `--foreground`, `--card-foreground` | `#2A2632` | warm ink |
| `--muted-foreground` | `#6B6675` | secondary text |
| `--primary` | `#B8932E` | brass-gold (AA on dark text/white) |
| `--primary-foreground` | `#1D1B22` | text on gold |
| `--ring` | `#B8932E` | focus ring |
| `--accent-teal` (new) | `#15567E` | links/secondary (AA on paper) |
| `--chart-1`, `--chart-2` | `#B8932E`, `#15567E` | data series |

### 3.3 Global niceties
- `font-variant-numeric: tabular-nums` applied so stat columns stay aligned site-wide.
- Existing `MarketPriceChart` / `SettlementTrendChart` colors (`#D5BB72`, `#747184`) already align; switch their hardcoded strokes to the chart tokens where practical (low priority).
- **Contrast target:** all text/UI pairs meet WCAG AA (4.5:1 body, 3:1 large/UI). Tune the exact hexes during implementation against a contrast check; the table values are the starting point.

---

## 4. Typography (`apps/web/app/layout.tsx` + `globals.css`)

- Add **Lexend** via `next/font/google` (weights 300/400/500/600) → `--font-sans`. Keep **Josefin Sans** (600/700) → `--font-display`.
- In `@theme`, set `--font-sans` to the Lexend variable (today it's undefined → system fallback). `--font-display` already exists.
- Heading rule: `h1,h2,h3` use `var(--font-display)`; body/UI use Lexend. Hero `h1` large (Josefin 700, ~clamp 2.5–3.5rem), tight tracking.

---

## 5. Theming mechanism

- Add **`next-themes`** (`ThemeProvider`, `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`, `disableTransitionOnChange`) wrapping the app in `layout.tsx`. `<html>` gets `suppressHydrationWarning`.
- Removes the current "light with no `dark` class" bug; persists choice; no flash-of-incorrect-theme.
- Header **theme toggle** (sun/moon icon button, accessible label).

---

## 6. Header (`apps/web/components/SiteHeader.tsx`)

Keep the strong existing structure (sticky, blurred, gold wordmark, primary nav incl. the new Settlements link). Upgrades:
- Migrate hardcoded hex (`#1D1B22`, `#D5BB72`, `#747184`, …) → tokens so it tracks both themes.
- Add the **theme toggle** at the nav's end.
- Active-link underline uses `--primary`; hover uses cream/ink per theme.
- Verify horizontal scroll/overflow behavior with the now-9 nav items on mobile (existing pattern already scrolls).

## 7. Footer (`apps/web/components/SiteFooter.tsx`, new; mounted in `layout.tsx`)

High-quality, token-driven, responsive:
- Brand wordmark + one-line tagline.
- Grouped link columns (e.g. **Explore:** Compendium, Calculator, Map · **Data:** Market, Settlements, Empires, Players, Leaderboards · **More:** Blog, Status).
- Contact emails from project branding: `hello@bitcraftcompanion.com`, `support@bitcraftcompanion.com`, `privacy@bitcraftcompanion.com`.
- Copyright + a short "not affiliated with BitCraft / Clockwork Labs" disclaimer line.

## 8. Shared primitives (`apps/web/components/ui/` or `components/`)

Styling-only, reuse existing markup; high leverage:
- **`PageHeader`** — `{ title, subtitle?, count? }`; the section pages (settlements, market, empires, players, leaderboards, compendium hubs) adopt it for one consistent heading treatment (Josefin title + muted subtext). Replaces ad-hoc `<h1>` + `<p>` blocks where trivial.
- **Button/link tokens** — primary (gold), secondary/ghost, and link (teal) styles expressed via tokens, so existing `bg-primary`/links pick them up.
- **Stat-card + table-header** — standardize the `rounded-lg border p-4` stat tile and `text-muted-foreground` table head already used by market/settlements so they read consistently and tabular.

> Adoption is incremental and low-risk: pages already use the shadcn token classes, so most upgrade for free; `PageHeader` is swapped in where it's a clean win, not a forced rewrite of every page.

## 9. Homepage (`apps/web/app/page.tsx`) — Cinematic hero

Server component, ISR (`revalidate = 300`). Sections:
1. **Hero** — full-bleed radial gold-on-dark (token) gradient; Josefin headline ("Master the supply economy." or final copy), Lexend subhead, **primary gold CTA** ("Explore the map →") + **teal secondary** ("Browse the market"). Light theme uses the paper/brass equivalent.
2. **Live-stat strip** — real counts from existing queries: settlements (`count(settlements)`), players (`count(players)`), empires (`count(empires)`), traded items (`count(market_item_summary)`). One small query module `apps/web/lib/queries/home.ts` (`getHomeStats()`); numbers in Lexend tabular.
3. **Feature tiles** — cards for Market, Map, Settlements, Compendium, Calculator, Empires; gold/teal hover lift; link into each section.
4. **Latest from the blog** — 2–3 recent posts via the existing blog query.

Hero copy is finalized during implementation; placeholder above is acceptable for the plan.

---

## 10. Testing & verification

- Pure styling/tokens → no new unit tests required.
- `getHomeStats()` gets a light unit test only if it adds non-trivial logic (else covered by build).
- Gate: `pnpm typecheck` + `pnpm --filter @bcc/web build` green.
- **Manual click-through in BOTH themes** across a representative set — home, a settlement detail, market list, map, a compendium list, a blog post — checking contrast, the toggle (no flash, persists), header/footer, and that no page regressed from the token swap.

## 11. Build/rollout order (for the plan)
tokens (`globals.css` both themes) → fonts/typography wiring → `next-themes` provider + toggle → header tokenization + toggle → footer → shared primitives (`PageHeader`, button/link, stat/table) → homepage (stats query → hero → tiles → blog row) → both-theme click-through + build. Keep `main` green; commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 12. Risks / notes
- Token swap is global — the click-through in both themes is the real safety net (a wrong contrast pairing is the likely defect, not a crash).
- Light theme is net-new surface; budget time to AA-tune gold/teal on paper.
- The existing rarity tints (`bg-*-900/40`) and badge colors were built for dark; in light mode they may need the token-mapped equivalents — note any that look off during click-through (fix in this pass if trivial, else log for the per-section polish plan).
