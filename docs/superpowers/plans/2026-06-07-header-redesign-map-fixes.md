# Header Redesign + Map Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the header so the mobile menu actually works (full-screen overlay portaled to `document.body`, escaping the header's `backdrop-filter` containing block) with a grouped desktop nav (`Data ▾` dropdown), and fix the map's hard-to-read region dropdown + rough mobile controls.

**Architecture:** A shared `nav-items.ts` data model (links + a "Data" group) drives both the desktop bar (links + an accessible `NavDropdown`) and the mobile overlay (`MobileNav`, rendered via `createPortal` to `document.body`). The map's inline-styled controls are re-tokenized and made to wrap on small screens.

**Tech Stack:** Next.js 16 (client components), React 19 `createPortal`, Tailwind v4 tokens, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-06-07-header-redesign-map-fixes-design.md`

**Conventions (every commit):**
- UI work: verify via `pnpm --filter @bcc/web typecheck`; the real gate is Task 5 (build + device-mode click-through that confirms the menu links render). No new unit tests.
- Commit directly to `main`; keep it green. Messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Root-cause reminder: the overlay MUST be portaled to `document.body` — a `fixed` element inside the `backdrop-filter` header is clipped to the header box.

---

## File Structure
**Create:**
- `apps/web/components/nav-items.ts` — nav data model + `isActive`/`isNavGroup` helpers (plain module, no "use client").
- `apps/web/components/NavDropdown.tsx` — desktop click dropdown for a nav group.

**Modify (rewrite):**
- `apps/web/components/MobileNav.tsx` — portal overlay with grouped sections + theme toggle.
- `apps/web/components/SiteHeader.tsx` — render the nav model (links + `NavDropdown`).
- `apps/web/components/map/WorldMap.tsx` — tokenize + wrap the region control and biome-key header.

---

## Task 1: Nav model + desktop `NavDropdown`

**Files:**
- Create: `apps/web/components/nav-items.ts`, `apps/web/components/NavDropdown.tsx`

- [ ] **Step 1: Create the nav model**

`apps/web/components/nav-items.ts`:
```ts
export interface NavLink {
  href: string;
  label: string;
}
export interface NavGroup {
  label: string;
  items: NavLink[];
}
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export const NAV: NavEntry[] = [
  { href: "/compendium", label: "Compendium" },
  { href: "/calculator", label: "Calculator" },
  { href: "/map", label: "Map" },
  {
    label: "Data",
    items: [
      { href: "/market", label: "Market" },
      { href: "/settlements", label: "Settlements" },
      { href: "/empires", label: "Empires" },
      { href: "/players", label: "Players" },
      { href: "/leaderboards", label: "Leaderboards" },
    ],
  },
  { href: "/blog", label: "Blog" },
];
```

- [ ] **Step 2: Create `NavDropdown`**

`apps/web/components/NavDropdown.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { isActive, type NavLink } from "./nav-items";

export function NavDropdown({ label, items, pathname }: { label: string; items: NavLink[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const groupActive = items.some((i) => isActive(pathname, i.href));

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside-click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors " +
          (groupActive ? "text-primary" : "text-muted-foreground hover:text-foreground")
        }
      >
        {label}
        <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              role="menuitem"
              aria-current={isActive(pathname, i.href) ? "page" : undefined}
              className={
                "block px-3 py-2 text-sm transition-colors " +
                (isActive(pathname, i.href) ? "text-primary" : "text-foreground hover:bg-muted")
              }
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add apps/web/components/nav-items.ts apps/web/components/NavDropdown.tsx
git commit -m "feat(header): nav data model + accessible desktop NavDropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `MobileNav` — portal overlay with grouped sections

**Files:**
- Modify (replace contents): `apps/web/components/MobileNav.tsx`

- [ ] **Step 1: Replace the file**

Replace the ENTIRE contents of `apps/web/components/MobileNav.tsx` with:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { NAV, isNavGroup, isActive, type NavLink } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open: lock body scroll, Escape to close, focus the close button, trap Tab.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const els = dialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const topLinks = NAV.filter((e): e is NavLink => !isNavGroup(e) && e.href !== "/blog");
  const groups = NAV.filter(isNavGroup);
  const blog = NAV.find((e) => !isNavGroup(e) && (e as NavLink).href === "/blog") as NavLink | undefined;

  function Section({ label, links }: { label: string; links: NavLink[] }) {
    return (
      <div className="mb-2">
        <div className="px-1 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(pathname, l.href) ? "page" : undefined}
            className={
              "block py-2.5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight transition-colors " +
              (isActive(pathname, l.href) ? "text-primary" : "text-foreground hover:text-primary")
            }
          >
            {l.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            id="mobile-menu"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="fixed inset-0 z-[100] flex flex-col bg-background lg:hidden"
          >
            <div className="flex h-14 items-center justify-end gap-1 px-4 sm:h-16 sm:px-6">
              <ThemeToggle />
              <button
                ref={closeRef}
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-6 pb-12">
              <Section label="Browse" links={topLinks} />
              {groups.map((g) => (
                <Section key={g.label} label={g.label} links={g.items} />
              ))}
              {blog && <Section label="More" links={[blog]} />}
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
```

(`createPortal(…, document.body)` is the fix — the overlay is no longer a DOM child of the `backdrop-filter` header, so `fixed inset-0` covers the viewport. The `mounted` guard avoids touching `document` during SSR. `MobileNav` now owns `NAV` itself — `SiteHeader` renders it with no props.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add apps/web/components/MobileNav.tsx
git commit -m "fix(header): portal the mobile overlay to body so links are visible

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `SiteHeader` — render the grouped nav

**Files:**
- Modify (replace contents): `apps/web/components/SiteHeader.tsx`

- [ ] **Step 1: Replace the file**

Replace the ENTIRE contents of `apps/web/components/SiteHeader.tsx` with:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { NavDropdown } from "./NavDropdown";
import { NAV, isNavGroup, isActive } from "./nav-items";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 shadow-[0_1px_0_0_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)] supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="BitCraft Companion — home"
        >
          <Logo size={30} />
          <span className="font-[family-name:var(--font-display)] text-lg font-bold leading-none tracking-tight">
            <span className="text-foreground transition-colors group-hover:text-primary">BitCraft</span>{" "}
            <span className="text-primary">Companion</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center justify-end gap-1 text-sm font-medium lg:flex">
          {NAV.map((e) =>
            isNavGroup(e) ? (
              <NavDropdown key={e.label} label={e.label} items={e.items} pathname={pathname} />
            ) : (
              <Link
                key={e.href}
                href={e.href}
                aria-current={isActive(pathname, e.href) ? "page" : undefined}
                className={
                  "relative whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors " +
                  (isActive(pathname, e.href)
                    ? "text-primary after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {e.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add apps/web/components/SiteHeader.tsx
git commit -m "feat(header): grouped desktop nav (Data dropdown) + wired mobile overlay

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Map controls — readable + responsive (`WorldMap.tsx`)

**Files:**
- Modify: `apps/web/components/map/WorldMap.tsx`

- [ ] **Step 1: Tokenize + wrap the region focus control**

Replace this block (the region focus selector, currently inline-styled):
```tsx
      {/* Region focus selector — lives OFF the map (above it), not floating over it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
        <label htmlFor="region-focus" style={{ color: "var(--muted-foreground, #666)" }}>Focus region</label>
        <select
          id="region-focus"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", fontSize: 14, minWidth: 180 }}
        >
          <option value="">All regions</option>
          {sorted.map((r) => <option key={r.id} value={r.id}>{regionLabel(r)}</option>)}
        </select>
        {selectedId !== null && (
          <button type="button" onClick={() => setSelectedId(null)} style={{ cursor: "pointer", background: "transparent", border: "none", color: "#a07f25", textDecoration: "underline", fontSize: 13 }}>
            Show all
          </button>
        )}
      </div>
```
with:
```tsx
      {/* Region focus selector — lives OFF the map (above it), not floating over it. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="region-focus" className="text-muted-foreground">Focus region</label>
        <select
          id="region-focus"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-card px-2 text-sm text-foreground sm:w-auto sm:min-w-[180px]"
        >
          <option value="">All regions</option>
          {sorted.map((r) => <option key={r.id} value={r.id}>{regionLabel(r)}</option>)}
        </select>
        {selectedId !== null && (
          <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-primary underline">
            Show all
          </button>
        )}
      </div>
```

- [ ] **Step 2: Tokenize the biome-key header row**

Replace this block:
```tsx
      {/* Biome key — click a biome to highlight it on the map. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted-foreground, #555)" }}>Biome key</span>
          <span style={{ fontSize: 11, color: "#999" }}>click to highlight</span>
          {selectedBiome !== null && (
            <button type="button" onClick={() => setSelectedBiome(null)} style={{ cursor: "pointer", background: "transparent", border: "none", color: "#a07f25", textDecoration: "underline", fontSize: 12 }}>
              Clear
            </button>
          )}
        </div>
```
with:
```tsx
      {/* Biome key — click a biome to highlight it on the map. */}
      <div className="mt-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-semibold text-muted-foreground">Biome key</span>
          <span className="text-xs text-muted-foreground">click to highlight</span>
          {selectedBiome !== null && (
            <button type="button" onClick={() => setSelectedBiome(null)} className="text-xs text-primary underline">
              Clear
            </button>
          )}
        </div>
```

(Leave the biome-legend buttons themselves unchanged — their inline styles carry the actual biome swatch colors and a gold selected-state, which are intentional and already `flexWrap`.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add apps/web/components/map/WorldMap.tsx
git commit -m "fix(map): tokenize + wrap region dropdown and biome-key controls

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verification (build + device-mode click-through)

- [ ] **Step 1: Typecheck whole workspace** — Run: `pnpm typecheck` → all pass.
- [ ] **Step 2: Tests** — Run: `pnpm test` → 182 pass (no regressions).
- [ ] **Step 3: Build** — Run: `pnpm --filter @bcc/web build` → succeeds.
- [ ] **Step 4: Click-through** — Run `pnpm --filter @bcc/web dev`; in browser devtools device mode at **375px** and a **desktop** width, in **BOTH themes**:
  - **Mobile menu (the regression):** tap ☰ → the overlay covers the full screen and **the links are visible and tappable** — grouped under Browse / Data / More; the theme toggle is in the overlay; tapping a link navigates and closes it; ✕ and Escape close it; the page behind does not scroll while open.
  - **Desktop nav:** `Compendium · Calculator · Map · Data ▾ · Blog`; the **Data** dropdown opens on click, closes on outside-click / Escape / navigation, and shows active state when on a Data route (e.g. `/market`).
  - **Map:** the **Focus region** dropdown is clearly readable in **light and dark**; on 375px the control row wraps and the select is full-width; the biome key reads correctly; no page-level horizontal scroll.
- [ ] **Step 5: Fix + final commit (only if the click-through found issues)**
```bash
git add -A
git commit -m "fix(header/map): click-through adjustments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage check
- §1/§4 mobile overlay via `createPortal(document.body)` (the bug fix) → Task 2. ✓
- §1/§3 grouped desktop nav with Data dropdown → Task 1 (`NavDropdown` + model) + Task 3 (wiring). ✓
- §2 nav model single source of truth → Task 1 (`nav-items.ts`). ✓
- §4 overlay group labels (Browse / Data / More) + theme toggle inside + scroll-lock/Esc/focus-trap → Task 2. ✓
- §5 map dropdown/controls tokenized for readability → Task 4 Steps 1–2. ✓
- §6 map controls wrap / select full-width on mobile → Task 4 Step 1. ✓
- §8 verification incl. explicit "links render" regression check → Task 5. ✓
- §7 out-of-scope (no destination changes, no bottom-sheet, no universal search, dropdown only for Data) — respected. ✓
