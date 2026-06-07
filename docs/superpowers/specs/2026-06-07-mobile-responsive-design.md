# Mobile / Responsive Pass (design)

**Date:** 2026-06-07
**Status:** Design / approved by user — proceeding to writing-plans
**Context:** The site was built desktop-first. The header only horizontally-scrolls its 9 nav links on small screens (no real mobile nav), and 10 pages render wide `<table>`s with no overflow handling, so they break the layout / cause page-level horizontal scroll on phones. Goal: make the whole site genuinely mobile-class at a "$10k" quality bar, building on the design-foundation tokens/fonts already shipped (see `2026-06-07-frontend-design-foundation-design.md`).

---

## 1. Decisions locked (clarifying gate)

- ✅ **Scope:** one full responsive pass — header, all data tables, map, and global polish.
- ✅ **Header (mobile):** **full-screen overlay menu** (option A) — not a side drawer.
- ✅ **Tables (mobile):** **stacked cards** (option C) for the ranked/list tables.
- ✅ **Breakpoints:** header collapses to the menu button below `lg` (1024px); tables become cards below `md` (768px).
- ✅ **Detail-page sub-tables:** stay as tables with a horizontal-scroll wrapper (not cards).
- ✅ **Card metrics:** controller picks 2–3 headline stats per page (listed below; exact field names confirmed against each page during planning).

## 2. Approach

Per table page, keep the existing `<table>` (wrap in `hidden md:block`) and add a sibling `md:hidden` mobile card list rendering the SAME query rows. Two presentations of one dataset — no `data-label` CSS hacks (keeps markup accessible and readable). Shared primitives keep the mobile look consistent rather than re-hand-rolled per page.

### New components
- `apps/web/components/MobileNav.tsx` — client; the full-screen overlay menu + menu button.
- `apps/web/components/mobile/MobileCard.tsx` — one card: title (links to detail) + optional subtitle + a row of labelled stat chips (`{label, value}[]`). Tabular numbers.
- (Optional helper) `apps/web/components/mobile/StatChip.tsx` if it reduces repetition; otherwise inline in `MobileCard`.

---

## 3. Header — full-screen overlay (`SiteHeader.tsx` + `MobileNav.tsx`)

- Slim sticky bar always present: logo (left) · theme toggle + menu button (right).
- The 9 inline nav links render only at `lg+` (`hidden lg:flex`). The theme toggle stays visible at all sizes.
- Below `lg`, `MobileNav` (client) renders the menu button; tapping it opens a **full-screen overlay**: brand background, fade/scale-in, the 9 links stacked in large Josefin type (active link in gold/`text-primary`), tap targets ≥ 44px, the theme toggle, and a close ✕.
- Behavior: locks body scroll while open; closes on link tap, ✕, or `Escape`; focus moves into the overlay and is trapped; `aria-expanded`/`aria-controls` on the button; overlay is `role="dialog"` `aria-modal`.
- The existing desktop header structure/links are preserved for `lg+`.

---

## 4. Data tables → mobile cards

Pattern per page: existing table → `hidden md:block` wrapper; add `md:hidden` `MobileCardList` (a `<ul>` of `MobileCard`). Each card links to the row's detail page where one exists. Headline metrics per page (2–3 chips; full data stays on desktop table + detail page):

| Page | Card title · subtitle | Chips (mobile) |
|---|---|---|
| `/settlements` | name · Region N | Tiles · Treasury · Members |
| `/market` | item name · type/tier | Lowest ask · Highest bid · Sold (24h) |
| `/players` | username · Region N | Total level · Total XP |
| `/empires` | name · Region N | Claims · Treasury · Members |
| `/leaderboards/skills` (totals grid) | username · Region N | Highest · Total · XP |
| `/leaderboards/activity` | username · Region N | the page's headline activity metric(s) |
| `/leaderboards/skills/[skill]` | username · Region N | Level · XP |

*(Exact column/field names per page are read and pinned during planning — these are the intended headline stats. The `#` rank is shown inline on the card where the list is ranked.)*

Sorting/search/pager controls stay above the list and apply to both presentations (they already drive the query).

---

## 5. Detail-page sub-tables (lighter touch)

Small 2–4 column tables on detail pages do NOT become cards. They get a horizontal-scroll wrapper so they never break the page, plus tightened mobile padding:
- `/market/[key]` — Asks/Bids ladders, Locations, Recent sales.
- `/empires/[id]` — members / claims tables.
- `/players/[id]` — Skills table, Claims list (claims list already stacks).
- `/settlements/[id]` — stat grid + members already stack (`grid-cols-2 sm:grid-cols-4`); spacing audit only.

Wrapper idiom: wrap the `<table>` in `<div className="-mx-6 overflow-x-auto px-6">` (or container-appropriate) so it scrolls within the content column.

---

## 6. Map on mobile (`MapClient.tsx`, `WorldMap.tsx`)

- Replace fixed `height: "78vh"` with a responsive height: `h-[70vh] min-h-[420px]` (class-based), so it's usable on short and tall viewports.
- Tokenize the hardcoded map background (`#1D1B22`) so the light theme renders correctly (use the background token / a CSS var).
- Verify Leaflet's `LayersControl` and the biome legend are reachable and scrollable on small screens (legend already wraps; confirm the control isn't clipped). No card conversion — the map stays a pan/zoom surface.

---

## 7. Global polish

- **Container padding:** `px-4 sm:px-6` on page `main` wrappers so content breathes at phone edges.
- **Touch targets:** nav links, buttons, sortable table headers, and the Pager controls ≥ 44px tall on mobile.
- **Type scale:** hero already clamps; audit page `h1`/`PageHeader` sizes so nothing overflows at 360px.
- **Footer:** confirm the 4-column grid stacks cleanly at 360px (it already uses `sm:grid-cols-2 lg:grid-cols-4`).
- **No page-level horizontal scroll** at 360px on any route — the acceptance bar.

---

## 8. Testing & verification

- Pure styling/markup → no new unit tests.
- Gate: `pnpm typecheck` + `pnpm --filter @bcc/web build` green.
- **Responsive click-through at 375px and ~768px, in BOTH themes** (browser devtools device mode): header overlay (open/close via tap, ✕, Esc; body scroll locked; focus trapped); each list page shows cards < md and the table ≥ md; detail sub-tables scroll within their column; map height is comfortable; footer stacks; and **no route has page-level horizontal scroll** at 360px.

## 9. Build/rollout order (for the plan)
global primitives (`MobileCard`/chips) → header overlay (`MobileNav` + `SiteHeader` collapse) → per-page mobile cards (settlements, market, players, empires, leaderboards ×3) → detail sub-table scroll wrappers → map mobile sizing/token → global polish (container padding, touch targets, overflow audit) → responsive both-theme click-through + build. Keep `main` green; commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 10. Risks / notes
- The work is broad but low-risk (additive markup + responsive utility classes); the real safety net is the 375px both-theme click-through.
- Duplicating row markup (table + cards) is intentional for clarity/accessibility; the shared `MobileCard` keeps the cards DRY. If a page's row mapping is non-trivial, factor the row→fields mapping into a small local helper so both presentations read from it.
- Out of scope: new data/features, per-section visual redesign beyond responsiveness, universal search (still deferred), bottom-tab navigation (overlay chosen instead).
