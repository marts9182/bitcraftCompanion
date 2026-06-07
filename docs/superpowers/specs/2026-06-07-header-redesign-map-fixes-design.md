# Header Redesign + Map Fixes (design)

**Date:** 2026-06-07
**Status:** Design / approved by user — proceeding to writing-plans
**Context:** The mobile menu from the responsive pass (`2026-06-07-mobile-responsive`) opens but shows **no links**. Root cause: the `<header>` uses `backdrop-blur` (`backdrop-filter`), and a non-`none` `backdrop-filter` establishes a containing block for `position: fixed` descendants — so the overlay's `fixed inset-0` resolved to the header's ~56px box and clipped the links out of view (the production build passed because it's a runtime layout issue, not a compile error). This phase redesigns the header to fix that correctly and to group the desktop nav, and fixes two map issues: the hard-to-read region dropdown and rough mobile controls.

---

## 1. Decisions locked (clarifying gate)

- ✅ **Mobile menu:** full-screen overlay, kept — but rendered via a **React portal to `document.body`** so it escapes the header's `backdrop-filter` containing block.
- ✅ **Desktop nav:** **grouped** — top-level links + a "Data" dropdown (not all 9 inline).
- ✅ **Grouping:** `Compendium · Calculator · Map · Data ▾ · Blog`, where **Data ▾** = Market, Settlements, Empires, Players, Leaderboards.
- ✅ **Mobile overlay:** flat large links with subtle **group labels** (Browse / Data / More).
- ✅ **Map:** targeted fixes — tokenize the region dropdown/controls for readability in both themes; make the control row + biome legend wrap/full-width on small screens (no bottom-sheet).

## 2. Nav model (single source of truth)

A structured list in `SiteHeader` (or a small `nav-items.ts`), each entry a link or a group:
```ts
type NavLink = { href: string; label: string };
type NavGroup = { label: string; items: NavLink[] };
type NavEntry = NavLink | NavGroup;

const NAV: NavEntry[] = [
  { href: "/compendium", label: "Compendium" },
  { href: "/calculator", label: "Calculator" },
  { href: "/map", label: "Map" },
  { label: "Data", items: [
    { href: "/market", label: "Market" },
    { href: "/settlements", label: "Settlements" },
    { href: "/empires", label: "Empires" },
    { href: "/players", label: "Players" },
    { href: "/leaderboards", label: "Leaderboards" },
  ] },
  { href: "/blog", label: "Blog" },
];
```
For the mobile overlay's group labels, the top-level links are shown under a "Browse" heading, the Data group under "Data", and Blog under "More" (Blog moves under "More" in the overlay only; the desktop bar keeps it top-level).

## 3. Desktop header (`lg+`)

- Render `NAV` inline: links as links; the **Data** group as a `NavDropdown`.
- **`NavDropdown`** (`apps/web/components/NavDropdown.tsx`, client): a button (`aria-haspopup="menu"`, `aria-expanded`) + a token-styled panel of child links. Opens on click, closes on outside-click, `Escape`, and route change. Not hover-only (works on touch laptops). Active styling (gold underline/text) when the current route matches any child (`pathname === href || startsWith(href + "/")`).
- The bar is `hidden lg:flex`; the right cluster (theme toggle + mobile menu button) is always present.

## 4. Mobile header (`< lg`) — overlay via portal

- `apps/web/components/MobileNav.tsx` (client): the menu button (`lg:hidden`) + the overlay.
- **The overlay is rendered with `createPortal(…, document.body)`** so it is NOT a DOM descendant of the backdrop-filtered `<header>`. Guard the portal for SSR (only portal after mount, e.g. a `mounted` state, so `document` is defined).
- Overlay: `fixed inset-0 z-[100] bg-background` (light/dark via token), a top row with the close ✕, then the links: top-level links under a **"Browse"** label, the Data group under a **"Data"** label, Blog under **"More"** — large Josefin links, active = gold, ≥44px tap targets. The **theme toggle** also appears in the overlay.
- Behavior: body scroll-lock while open, `Escape` closes, focus moves to ✕ on open and is trapped (Tab cycles within), closes on link tap / route change.
- The bar's right cluster keeps the always-visible `ThemeToggle` + the menu button.

## 5. Map dropdown + controls readability (`WorldMap.tsx`)

Replace the hardcoded inline colors with theme tokens:
- The **"Focus region" `<select>`**: `bg-card text-foreground border border-border` (was `background:#fff;border:1px solid #ccc`), comfortable padding, readable in both themes.
- Its **label** and the biome-key "click to highlight" hint: `text-muted-foreground` (was `#666`/`#999`).
- The **"Show all"** buttons (region + biome): `text-primary` (was `#a07f25`).
- Keep the existing structure; just swap colors to tokens and convert the relevant inline styles to classes where practical.

## 6. Map on mobile (`WorldMap.tsx`)

- The **control row** (label + select + "Show all") becomes `flex-wrap`; the `<select>` goes full-width (`w-full sm:w-auto` / `min-w-0`) so it doesn't overflow.
- The **biome legend** wraps (already a flex row) and its chips remain tappable; ensure it doesn't force horizontal scroll at 360px.
- Map height stays the responsive `h-[70vh] min-h-[420px]` (from the prior pass). Leaflet zoom + layers controls remain reachable (no layout change needed beyond the wrapping).

## 7. Out of scope
- No change to the nav's destinations or page content; no bottom-sheet map UI; no universal search; the desktop dropdown is only for the "Data" group (Calculator/Map stay top-level).

## 8. Testing & verification
- Pure UI → no new unit tests.
- Gate: `pnpm typecheck` + `pnpm --filter @bcc/web build` green.
- **Device-mode click-through at 375px and a desktop width, in BOTH themes** — the explicit regression check: open the mobile menu and **confirm the links render and are tappable**; menu scroll-lock/Esc/focus-trap work; the **Data** dropdown opens/closes (click, outside-click, Esc) on desktop and shows active state; the map region **dropdown is clearly readable** in light + dark; map controls + biome legend wrap with no horizontal scroll; theme toggle reachable in both the bar and the overlay.

## 9. Build/rollout order (for the plan)
nav model + `NavDropdown` → `MobileNav` portal overlay (with group labels + theme toggle) → `SiteHeader` wired to both → map controls tokenized + readable → map controls responsive wrap → click-through + build. Keep `main` green; commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 10. Notes
- The portal is the crux: any element using `fixed` to cover the viewport must not be a descendant of a `filter`/`backdrop-filter`/`transform` ancestor. Portaling to `document.body` is the robust fix.
- Reuse the existing `ThemeToggle`; the overlay imports and renders it.
