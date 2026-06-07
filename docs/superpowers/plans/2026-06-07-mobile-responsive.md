# Mobile / Responsive Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole site mobile-class: a full-screen overlay header menu below `lg`, the 7 ranked tables rendered as stacked cards below `md`, scroll-wrapped detail sub-tables, a responsive map, and global padding so nothing breaks the viewport on phones.

**Architecture:** Per ranked-table page, keep the existing `<table>` (shown `md:table`, hidden on mobile) and add a sibling `md:hidden` list of a shared `MobileCard` rendering the same query rows. The header keeps its `lg+` inline nav and adds a `MobileNav` client component (menu button + full-screen overlay dialog) for `< lg`. Pure presentation — no new data/queries.

**Tech Stack:** Next.js 16 (App Router, RSC + a couple of client components), Tailwind v4, `lucide-react` icons. Brand tokens/fonts already shipped.

**Spec:** `docs/superpowers/specs/2026-06-07-mobile-responsive-design.md`

**Conventions (every commit):**
- Visual/markup work: verify via `pnpm --filter @bcc/web typecheck` per task; the real gate is Task 9 (build + responsive both-theme click-through). No new unit tests.
- Commit directly to `main`; keep it green. Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Breakpoints: header overlay `< lg` (1024px); table→cards `< md` (768px).
- Numbers use Lexend `tabular-nums` (NOT monospace) — the brand standard.

---

## File Structure

**Create:**
- `apps/web/components/mobile/MobileCard.tsx` — one card: rank? + title (links to detail) + subtitle? + labelled stat chips.
- `apps/web/components/MobileNav.tsx` — client; menu button + full-screen overlay menu.

**Modify (add `hidden md:table` to the `<table>` + a `md:hidden` MobileCard list):**
- `apps/web/app/settlements/page.tsx`, `apps/web/app/market/page.tsx`
- `apps/web/app/players/page.tsx`, `apps/web/app/empires/page.tsx`
- `apps/web/app/leaderboards/skills/page.tsx`, `apps/web/app/leaderboards/activity/page.tsx`, `apps/web/app/leaderboards/skills/[skill]/page.tsx`

**Modify (other):**
- `apps/web/components/SiteHeader.tsx` — inline nav `hidden lg:flex`; mount `MobileNav` + keep `ThemeToggle` always visible.
- `apps/web/app/market/[key]/page.tsx`, `apps/web/app/empires/[id]/page.tsx`, `apps/web/app/players/[id]/page.tsx` — scroll-wrap detail sub-tables.
- `apps/web/components/map/MapClient.tsx`, `apps/web/components/map/WorldMap.tsx` — responsive map height + token bg.
- Page/container padding sweep (`px-6` → `px-4 sm:px-6`) across route wrappers + header + footer.

---

## Task 1: `MobileCard` shared component

**Files:**
- Create: `apps/web/components/mobile/MobileCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export interface MobileCardStat {
  label: string;
  value: ReactNode;
}

/** A single mobile list row rendered as a card: optional rank + title (links to
 *  detail when href is given), optional subtitle, and a row of labelled stat chips.
 *  Used below the `md` breakpoint in place of wide tables. */
export function MobileCard({
  href,
  title,
  subtitle,
  rank,
  stats,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  rank?: number | string;
  stats: MobileCardStat[];
}) {
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        {rank != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rank}</span>}
        <span className="font-semibold text-foreground group-hover:text-primary">{title}</span>
      </div>
      {subtitle != null && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      {stats.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {stats.map((s, i) => (
            <div key={i}>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</dt>
              <dd className="text-sm tabular-nums text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
  const cls = "group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50";
  return <li>{href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add apps/web/components/mobile/MobileCard.tsx
git commit -m "feat(mobile): shared MobileCard list-row component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Mobile header overlay (`MobileNav` + `SiteHeader`)

**Files:**
- Create: `apps/web/components/MobileNav.tsx`
- Modify: `apps/web/components/SiteHeader.tsx`

- [ ] **Step 1: Create `MobileNav`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileNav({ navItems }: { navItems: [string, string][] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open: lock body scroll, Escape to close, focus the close button,
  // and trap Tab focus within the dialog.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
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
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

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

      {open && (
        <div
          id="mobile-menu"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 z-[100] flex flex-col bg-background lg:hidden"
        >
          <div className="flex h-14 items-center justify-end px-4 sm:h-16 sm:px-6">
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
          <nav aria-label="Mobile" className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 pb-12">
            {navItems.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={
                  "py-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight transition-colors " +
                  (isActive(pathname, href) ? "text-primary" : "text-foreground hover:text-primary")
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Update `SiteHeader`**

Replace the entire contents of `apps/web/components/SiteHeader.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";

const NAV: [string, string][] = [
  ["/compendium", "Compendium"],
  ["/calculator", "Calculator"],
  ["/map", "Map"],
  ["/empires", "Empires"],
  ["/settlements", "Settlements"],
  ["/players", "Players"],
  ["/market", "Market"],
  ["/leaderboards", "Leaderboards"],
  ["/blog", "Blog"],
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

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

        <nav
          aria-label="Primary"
          className="hidden flex-1 items-center justify-end gap-1 overflow-x-auto text-sm font-medium [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex"
        >
          {NAV.map(([href, label]) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "relative whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors " +
                  (active
                    ? "text-primary after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <ThemeToggle />
          <MobileNav navItems={NAV} />
        </div>
      </div>
    </header>
  );
}
```

(Inline nav is now `hidden lg:flex` and takes the flex-1 space when shown; on mobile the `ml-auto` right cluster holds the always-visible `ThemeToggle` + the `MobileNav` menu button — `MobileNav`'s own button is `lg:hidden`.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add apps/web/components/MobileNav.tsx apps/web/components/SiteHeader.tsx
git commit -m "feat(mobile): full-screen overlay nav below lg breakpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Mobile cards — Settlements + Market

**Files:**
- Modify: `apps/web/app/settlements/page.tsx`, `apps/web/app/market/page.tsx`

- [ ] **Step 1: Settlements — hide the table on mobile**

In `apps/web/app/settlements/page.tsx`, change the table opening tag from:
```tsx
      <table className="mt-6 w-full text-sm">
```
to:
```tsx
      <table className="mt-6 hidden w-full text-sm md:table">
```

- [ ] **Step 2: Settlements — add the mobile card list + import**

Add the import after the `PageHeader` import:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Then immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((s, i) => (
          <MobileCard
            key={s.entityId}
            href={`/settlements/${s.entityId}`}
            rank={(params.page - 1) * SETTLEMENT_PAGE_SIZE + i + 1}
            title={s.name || `Claim ${s.entityId}`}
            subtitle={`Region ${s.region}`}
            stats={[
              { label: "Tiles", value: s.numTiles.toLocaleString() },
              { label: "Treasury", value: s.treasury.toLocaleString() },
              { label: "Members", value: s.memberCount.toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No settlements found.</li>}
      </ul>
```

- [ ] **Step 3: Market — hide the table on mobile**

In `apps/web/app/market/page.tsx`, change:
```tsx
      <table className="mt-6 w-full text-sm">
```
to:
```tsx
      <table className="mt-6 hidden w-full text-sm md:table">
```

- [ ] **Step 4: Market — add the mobile card list + imports**

The page already imports `EntityIcon` and `marketKey`. Add after the `PageHeader` import:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Then immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((m, i) => (
          <MobileCard
            key={`${m.itemType}-${m.itemId}`}
            href={`/market/${marketKey(m.itemType, m.itemId)}`}
            rank={(params.page - 1) * MARKET_PAGE_SIZE + i + 1}
            title={
              <span className="inline-flex items-center gap-2">
                <EntityIcon assetName={m.iconAssetName} name={m.itemName} rarity={m.rarity} size={20} />
                {m.itemName || `#${m.itemId}`}
              </span>
            }
            subtitle={`${m.itemType === 1 ? "Cargo" : "Item"}${m.tier != null ? ` · Tier ${m.tier}` : ""}`}
            stats={[
              { label: "Lowest ask", value: m.lowestAsk?.toLocaleString() ?? "—" },
              { label: "Highest bid", value: m.highestBid?.toLocaleString() ?? "—" },
              { label: "Sold (24h)", value: m.soldQtyRecent.toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No items found.</li>}
      </ul>
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add "apps/web/app/settlements/page.tsx" apps/web/app/market/page.tsx
git commit -m "feat(mobile): settlements + market list cards under md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mobile cards — Players + Empires

**Files:**
- Modify: `apps/web/app/players/page.tsx`, `apps/web/app/empires/page.tsx`

- [ ] **Step 1: Players — hide the table on mobile**

In `apps/web/app/players/page.tsx`, change:
```tsx
      <table className="mt-6 w-full text-sm">
```
to:
```tsx
      <table className="mt-6 hidden w-full text-sm md:table">
```

- [ ] **Step 2: Players — add the mobile card list + import**

Add after the `Pager` import:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Then immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((p, i) => (
          <MobileCard
            key={p.entityId}
            href={`/players/${p.entityId}`}
            rank={(page - 1) * LB_PAGE_SIZE + i + 1}
            title={p.username}
            subtitle={`${p.region || "—"}${p.signedIn ? " · online" : ""}`}
            stats={[
              { label: "Total level", value: p.totalLevel.toLocaleString() },
              { label: "Hours played", value: Math.round(p.timePlayed / 3600).toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No players found.</li>}
      </ul>
```

- [ ] **Step 3: Empires — hide the table on mobile**

In `apps/web/app/empires/page.tsx`, change:
```tsx
      <table className="mt-6 w-full text-sm">
```
to:
```tsx
      <table className="mt-6 hidden w-full text-sm md:table">
```

- [ ] **Step 4: Empires — add the mobile card list + imports**

The page already imports `vividTerritoryColor`. Add after the `getEmpiresList` import line:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Then immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((e, i) => (
          <MobileCard
            key={e.entityId}
            href={`/empires/${e.entityId}`}
            rank={(page - 1) * LB_PAGE_SIZE + i + 1}
            title={
              <span className="inline-flex items-center gap-2">
                {e.color && (
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: vividTerritoryColor(e.color) }}
                  />
                )}
                {e.name}
              </span>
            }
            stats={[
              { label: "Members", value: e.memberCount.toLocaleString() },
              { label: "Claims", value: e.numClaims.toLocaleString() },
              { label: "Hexite energy", value: e.currencyTreasury.toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No empires found.</li>}
      </ul>
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add apps/web/app/players/page.tsx apps/web/app/empires/page.tsx
git commit -m "feat(mobile): players + empires list cards under md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Mobile cards — Leaderboards (skills, activity, per-skill)

**Files:**
- Modify: `apps/web/app/leaderboards/skills/page.tsx`, `apps/web/app/leaderboards/activity/page.tsx`, `apps/web/app/leaderboards/skills/[skill]/page.tsx`

- [ ] **Step 1: Skills leaderboard — hide table + add cards**

In `apps/web/app/leaderboards/skills/page.tsx`, change `<table className="mt-6 w-full text-sm">` to `<table className="mt-6 hidden w-full text-sm md:table">`. Add after the `getTotalLeaderboard` import line:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r) => (
          <MobileCard
            key={r.entityId}
            href={`/players/${r.entityId}`}
            rank={r.rank}
            title={r.username}
            subtitle={r.region}
            stats={[
              { label: "Highest", value: r.highestLevel },
              { label: "Total level", value: Number(r.totalLevel).toLocaleString() },
              { label: "Total XP", value: Number(r.totalXp).toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No ranked players yet.</li>}
      </ul>
```

- [ ] **Step 2: Activity leaderboard — hide table + add cards**

In `apps/web/app/leaderboards/activity/page.tsx`, change `<table className="mt-6 w-full text-sm">` to `<table className="mt-6 hidden w-full text-sm md:table">`. Add after the `getActivityLeaderboard` import line:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r, i) => (
          <MobileCard
            key={r.entityId}
            href={`/players/${r.entityId}`}
            rank={(params.page - 1) * LB_PAGE_SIZE + i + 1}
            title={r.username}
            subtitle={`${r.region} · ${r.signedIn ? "online" : "offline"}`}
            stats={[{ label: "Time played", value: hours(r.timePlayed) }]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No players yet.</li>}
      </ul>
```

- [ ] **Step 3: Per-skill leaderboard — hide table + add cards**

In `apps/web/app/leaderboards/skills/[skill]/page.tsx`, change `<table className="mt-6 w-full text-sm">` to `<table className="mt-6 hidden w-full text-sm md:table">`. Add after the `getSkillLeaderboard` import line:
```tsx
import { MobileCard } from "@/components/mobile/MobileCard";
```
Immediately AFTER the closing `</table>` line, add:
```tsx
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r) => (
          <MobileCard
            key={r.entityId}
            href={`/players/${r.entityId}`}
            rank={r.rank}
            title={r.username}
            subtitle={r.region}
            stats={[
              { label: "Level", value: r.level },
              { label: "XP", value: Number(r.xp).toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No players yet.</li>}
      </ul>
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add "apps/web/app/leaderboards/skills/page.tsx" apps/web/app/leaderboards/activity/page.tsx "apps/web/app/leaderboards/skills/[skill]/page.tsx"
git commit -m "feat(mobile): leaderboard list cards under md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Scroll-wrap detail-page sub-tables

**Files:**
- Modify: `apps/web/app/market/[key]/page.tsx`, `apps/web/app/empires/[id]/page.tsx`, `apps/web/app/players/[id]/page.tsx`

For each `<table …>…</table>` element in these three files, wrap it in a horizontal-scroll container so a wide table scrolls within the content column instead of breaking the page. Read each file and apply the wrapper to every `<table>` it contains.

- [ ] **Step 1: Wrap each table**

Wrap each `<table …>` … `</table>` block like this (preserve the existing table markup unchanged inside):
```tsx
<div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
  <table …> … </table>
</div>
```
- `apps/web/app/market/[key]/page.tsx`: the Asks table, the Bids table, the Locations table, and the Recent sales table (4 tables).
- `apps/web/app/empires/[id]/page.tsx`: each members/claims `<table>` it renders.
- `apps/web/app/players/[id]/page.tsx`: the Skills `<table>` (the Claims list is a `<ul>`, leave it).

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add "apps/web/app/market/[key]/page.tsx" "apps/web/app/empires/[id]/page.tsx" "apps/web/app/players/[id]/page.tsx"
git commit -m "feat(mobile): scroll-wrap detail-page sub-tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Responsive map height + token background

**Files:**
- Modify: `apps/web/components/map/MapClient.tsx`, `apps/web/components/map/WorldMap.tsx`

- [ ] **Step 1: MapClient loading placeholder**

In `apps/web/components/map/MapClient.tsx`, replace the loading `<div>`:
```tsx
    <div
      className="flex items-center justify-center rounded-lg text-sm text-muted-foreground"
      style={{ height: "78vh", background: "#1D1B22" }}
    >
      Loading map…
    </div>
```
with:
```tsx
    <div className="flex h-[70vh] min-h-[420px] items-center justify-center rounded-lg bg-card text-sm text-muted-foreground">
      Loading map…
    </div>
```

- [ ] **Step 2: WorldMap container**

In `apps/web/components/map/WorldMap.tsx`, find the `<MapContainer …>` and change its style prop:
```tsx
        style={{ height: "78vh", background: "#1D1B22", borderRadius: "0.5rem" }}
```
to use a class for sizing + a token background (keep any other MapContainer props unchanged):
```tsx
        className="h-[70vh] min-h-[420px] rounded-lg"
        style={{ background: "var(--card)" }}
```
(If `MapContainer` already has a `className`, merge these classes into it instead of adding a second prop.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add apps/web/components/map/MapClient.tsx apps/web/components/map/WorldMap.tsx
git commit -m "feat(mobile): responsive map height + token background

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Container padding sweep (`px-6` → `px-4 sm:px-6`)

**Files:** the route page `main` wrappers + header/footer inner containers.

- [ ] **Step 1: Find the wrappers**

Run: `grep -rn "px-6" apps/web/app apps/web/components/SiteFooter.tsx`
This lists every container using `px-6`. (`SiteHeader` was already updated to `px-4 sm:px-6` in Task 2.)

- [ ] **Step 2: Replace in each container**

In each `main`/section/container wrapper, change the standalone `px-6` utility to `px-4 sm:px-6`. Concretely, for every occurrence of `px-6 py-` (page wrappers) and the footer's `px-6 py-12`, and the homepage section wrappers (`max-w-6xl px-6 …`), replace `px-6` with `px-4 sm:px-6`. Do NOT change `px-6` that is part of a non-container utility (e.g. none expected). Pages to update include: `app/page.tsx` (hero/strip/sections), `app/settlements/page.tsx`, `app/market/page.tsx`, `app/market/[key]/page.tsx`, `app/players/page.tsx`, `app/players/[id]/page.tsx`, `app/empires/page.tsx`, `app/empires/[id]/page.tsx`, `app/settlements/[id]/page.tsx`, `app/leaderboards/skills/page.tsx`, `app/leaderboards/activity/page.tsx`, `app/leaderboards/skills/[skill]/page.tsx`, `app/blog/page.tsx`, and `components/SiteFooter.tsx`. (Use the grep output as the authoritative list; update every container `px-6` found.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.

```bash
git add -A
git commit -m "feat(mobile): tighter container padding on phones (px-4 sm:px-6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verification (build + responsive both-theme click-through)

- [ ] **Step 1: Typecheck whole workspace** — Run: `pnpm typecheck` → all pass.
- [ ] **Step 2: Tests** — Run: `pnpm test` → 182 pass (no regressions; this phase added none).
- [ ] **Step 3: Build** — Run: `pnpm --filter @bcc/web build` → succeeds.
- [ ] **Step 4: Responsive click-through** — Run `pnpm --filter @bcc/web dev`, open in browser devtools device mode at **375px** and **768px**, in **BOTH themes**:
  - **Header:** below `lg`, only logo + theme toggle + menu button show; the menu opens a full-screen overlay; links are large; tapping a link / ✕ / Escape closes it; body scroll is locked while open; focus starts on ✕ and Tab cycles within. At `lg+`, the inline nav returns.
  - **List pages** (settlements, market, players, empires, leaderboards ×3): at 375px show **cards** (no table, no sideways page scroll); at 768px+ show the **table**. Cards link to detail; numbers are tabular.
  - **Detail pages** (market/[key], empires/[id], players/[id]): wide sub-tables scroll within their column; the page itself does not scroll sideways.
  - **Map:** comfortable height, correct background in light theme, layers control + biome legend reachable.
  - **Global:** footer stacks cleanly; **no route has page-level horizontal scroll at 360px**.
- [ ] **Step 5: Fix + final commit (only if the click-through found issues)**

```bash
git add -A
git commit -m "fix(mobile): responsive click-through adjustments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage check

- §1/§2 breakpoints + dual-presentation approach → Tasks 3–5 (`hidden md:table` + `md:hidden` cards), Task 2 (`lg` header). ✓
- §2 new components (`MobileNav`, `MobileCard`) → Tasks 1, 2. ✓
- §3 full-screen overlay header (scroll lock, Esc, focus trap, a11y, `lg` collapse, toggle always visible) → Task 2. ✓
- §4 mobile cards on the 7 ranked pages with the listed headline metrics → Tasks 3, 4, 5. ✓
- §5 detail sub-tables scroll-wrapped → Task 6. ✓
- §6 map responsive height + token bg → Task 7. ✓
- §7 global polish (container padding; no-horizontal-scroll bar) → Task 8 + Task 9 acceptance. ✓
- §8 verification (typecheck/build/responsive both-theme click-through) → Task 9. ✓
- §8-spec out-of-scope (no new data, no per-section redesign, no universal search, no bottom-tab) — not implemented. ✓

(Touch-target sizing from §7 is satisfied by the existing button/nav heights plus the overlay's `py-3` large links and the `h-9` icon buttons; Task 9 confirms nothing is under-sized, fixing any stragglers in Step 5.)
