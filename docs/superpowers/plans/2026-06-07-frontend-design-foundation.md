# Frontend Design Foundation + Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the whole site onto the BitCraft brand (dark default + light toggle, gold+teal, Josefin/Lexend) by replacing the shadcn token palette, wire the fonts and a theme toggle, add a high-quality header & footer, and ship a cinematic homepage.

**Architecture:** Keep the existing shadcn CSS-variable token *names* (`--background`, `--primary`, …) and just swap their values for both themes in `globals.css`, so every page re-skins for free. Add `next-themes` (class strategy, default dark) for the toggle. Build a small set of shared primitives (`PageHeader`, plus the existing `Button`) and a new `SiteFooter`. The homepage is a server component reading live counts.

**Tech Stack:** Next.js 16 (App Router, RSC), Tailwind v4, shadcn/base-ui, `next-themes`, `lucide-react`, Drizzle, `next/font/google` (Josefin Sans + Lexend).

**Spec:** `docs/superpowers/specs/2026-06-07-frontend-design-foundation-design.md`

**Conventions (every commit):**
- This is mostly visual work: pure styling/markup tasks verify via `pnpm --filter @bcc/web typecheck` (+ the final build & both-theme click-through), not unit tests. Only `getHomeStats` is logic, and it's trivial (covered by build) per the spec.
- Work commits directly to `main`; keep it green.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Reference files (read for idiom): `apps/web/components/ui/button.tsx` (Button + `buttonVariants`), `apps/web/app/blog/page.tsx` (post card), `apps/web/lib/db.ts` (`getDb`, `schema`), `apps/web/lib/blog/posts.ts` (`getAllPosts`, `PostMeta`).

---

## File Structure

**Create:**
- `apps/web/components/ThemeProvider.tsx` — client wrapper around `next-themes`.
- `apps/web/components/ThemeToggle.tsx` — client sun/moon toggle button.
- `apps/web/components/SiteFooter.tsx` — site footer (brand, link groups, contact emails, disclaimer).
- `apps/web/components/PageHeader.tsx` — shared page title/subtitle primitive.
- `apps/web/lib/queries/home.ts` — `getHomeStats()` live counts for the homepage.

**Modify:**
- `apps/web/app/globals.css` — brand tokens (both themes) + base-layer (tabular-nums, heading font) + two accent-teal `@theme` mappings.
- `apps/web/app/layout.tsx` — Lexend font, `ThemeProvider`, `suppressHydrationWarning`, mount `SiteFooter`.
- `apps/web/components/SiteHeader.tsx` — tokenize hex → tokens, add `ThemeToggle`.
- `apps/web/app/page.tsx` — cinematic homepage.
- `apps/web/app/settlements/page.tsx`, `apps/web/app/market/page.tsx` — adopt `PageHeader` (demonstrates the primitive; zero layout change).

---

## Task 1: Brand tokens in `globals.css`

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add accent-teal token mappings to the `@theme inline` block**

In `apps/web/app/globals.css`, find the line `  --color-accent-foreground: var(--accent-foreground);` inside the `@theme inline {` block and add two lines immediately after it:

```css
  --color-accent-teal: var(--accent-teal);
  --color-accent-teal-strong: var(--accent-teal-strong);
```

- [ ] **Step 2: Replace the entire `:root { … }` block (light theme)**

Replace the whole `:root { … }` block (currently the oklch neutral values) with:

```css
:root {
  --background: #F6F2E9;
  --foreground: #2A2632;
  --card: #FFFFFF;
  --card-foreground: #2A2632;
  --popover: #FFFFFF;
  --popover-foreground: #2A2632;
  --primary: #B8932E;
  --primary-foreground: #1D1B22;
  --secondary: #EFE9DA;
  --secondary-foreground: #2A2632;
  --muted: #EFE9DA;
  --muted-foreground: #6B6675;
  --accent: #EFE9DA;
  --accent-foreground: #2A2632;
  --destructive: #C1121F;
  --border: #E0D8C6;
  --input: #E0D8C6;
  --ring: #B8932E;
  --accent-teal: #15567E;
  --accent-teal-strong: #15567E;
  --chart-1: #B8932E;
  --chart-2: #15567E;
  --chart-3: #9A7B22;
  --chart-4: #6B6675;
  --chart-5: #2A2632;
  --radius: 0.625rem;
  --sidebar: #F6F2E9;
  --sidebar-foreground: #2A2632;
  --sidebar-primary: #B8932E;
  --sidebar-primary-foreground: #1D1B22;
  --sidebar-accent: #EFE9DA;
  --sidebar-accent-foreground: #2A2632;
  --sidebar-border: #E0D8C6;
  --sidebar-ring: #B8932E;
}
```

- [ ] **Step 3: Replace the entire `.dark { … }` block (dark theme, default)**

Replace the whole `.dark { … }` block with:

```css
.dark {
  --background: #1D1B22;
  --foreground: #E9DFC4;
  --card: #2E2B3B;
  --card-foreground: #E9DFC4;
  --popover: #2E2B3B;
  --popover-foreground: #E9DFC4;
  --primary: #D5BB72;
  --primary-foreground: #1D1B22;
  --secondary: #38373C;
  --secondary-foreground: #E9DFC4;
  --muted: #2E2B3B;
  --muted-foreground: #A8A4B3;
  --accent: #38373C;
  --accent-foreground: #E9DFC4;
  --destructive: #E5484D;
  --border: #38373C;
  --input: #38373C;
  --ring: #D5BB72;
  --accent-teal: #3C7FAA;
  --accent-teal-strong: #15567E;
  --chart-1: #D5BB72;
  --chart-2: #3C7FAA;
  --chart-3: #B8932E;
  --chart-4: #747184;
  --chart-5: #E9DFC4;
  --sidebar: #1D1B22;
  --sidebar-foreground: #E9DFC4;
  --sidebar-primary: #D5BB72;
  --sidebar-primary-foreground: #1D1B22;
  --sidebar-accent: #38373C;
  --sidebar-accent-foreground: #E9DFC4;
  --sidebar-border: #38373C;
  --sidebar-ring: #D5BB72;
}
```

- [ ] **Step 4: Replace the `@layer base { … }` block (add tabular-nums + heading font)**

Replace the existing `@layer base { … }` block with:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-variant-numeric: tabular-nums;
  }
  html {
    @apply font-sans;
  }
  h1, h2, h3 {
    font-family: var(--font-display);
  }
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors (CSS-only change; typecheck just confirms nothing else broke).

```bash
git add apps/web/app/globals.css
git commit -m "feat(design): brand tokens for dark+light themes + tabular nums + heading font

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `next-themes` + ThemeProvider + ThemeToggle

**Files:**
- Create: `apps/web/components/ThemeProvider.tsx`, `apps/web/components/ThemeToggle.tsx`

- [ ] **Step 1: Install next-themes**

Run: `pnpm --filter @bcc/web add next-themes`
Expected: `next-themes` added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Create the ThemeProvider**

Create `apps/web/components/ThemeProvider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 3: Create the ThemeToggle**

Create `apps/web/components/ThemeToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
    >
      {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="h-4 w-4" />}
    </button>
  );
}
```

(The `mounted` guard prevents a hydration mismatch — the server can't know the resolved theme.)

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/package.json apps/web/components/ThemeProvider.tsx apps/web/components/ThemeToggle.tsx
git commit -m "feat(design): next-themes provider + sun/moon theme toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(If `pnpm-lock.yaml` changed, include it in the `git add`.)

---

## Task 3: SiteFooter

**Files:**
- Create: `apps/web/components/SiteFooter.tsx`

- [ ] **Step 1: Create the footer**

Create `apps/web/components/SiteFooter.tsx`:

```tsx
import Link from "next/link";
import { Logo } from "./Logo";

const GROUPS: { heading: string; links: [string, string][] }[] = [
  { heading: "Explore", links: [["/compendium", "Compendium"], ["/calculator", "Calculator"], ["/map", "Map"]] },
  { heading: "Live data", links: [["/market", "Market"], ["/settlements", "Settlements"], ["/empires", "Empires"], ["/players", "Players"], ["/leaderboards", "Leaderboards"]] },
  { heading: "More", links: [["/blog", "Blog"], ["/status", "Status"]] },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="BitCraft Companion — home">
              <Logo size={28} />
              <span className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight">
                <span className="text-foreground">BitCraft</span> <span className="text-primary">Companion</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              The fast, comprehensive companion for BitCraft Online — live markets, settlements, empires, map, and crafting.
            </p>
          </div>
          {GROUPS.map((g) => (
            <div key={g.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.heading}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {g.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="mailto:hello@bitcraftcompanion.com" className="transition-colors hover:text-foreground">hello@bitcraftcompanion.com</a>
            <a href="mailto:support@bitcraftcompanion.com" className="transition-colors hover:text-foreground">support@bitcraftcompanion.com</a>
            <a href="mailto:privacy@bitcraftcompanion.com" className="transition-colors hover:text-foreground">privacy@bitcraftcompanion.com</a>
          </div>
          <p>© 2026 BitCraft Companion · Not affiliated with BitCraft or Clockwork Labs.</p>
        </div>
      </div>
    </footer>
  );
}
```

(`Logo` is the existing component imported the same way `SiteHeader` does.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/components/SiteFooter.tsx
git commit -m "feat(design): site footer (brand, link groups, contact emails)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire fonts + ThemeProvider + footer into the layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Replace the layout file**

Replace the entire contents of `apps/web/app/layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import { Josefin_Sans, Lexend } from "next/font/google";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";
import { jsonLdScript } from "@/lib/jsonld";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata = defaultMetadata;

const josefin = Josefin_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${josefin.variable} ${lexend.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <ThemeProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

(Lexend is registered with `variable: "--font-sans"`, which is what `@theme`'s `--font-sans` and the base `html { @apply font-sans }` already point at — so body text now actually uses Lexend. `next-themes` adds the `dark`/`light` class to `<html>` at runtime alongside the font-variable classes; `suppressHydrationWarning` covers that.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(design): wire Lexend body font, theme provider, and footer into layout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Tokenize the header + add the theme toggle

**Files:**
- Modify: `apps/web/components/SiteHeader.tsx`

- [ ] **Step 1: Replace the header file**

Replace the entire contents of `apps/web/components/SiteHeader.tsx` with (hardcoded hex → tokens, `ThemeToggle` appended to the nav; nav entries unchanged including Settlements after Empires):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

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
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6 sm:h-16">
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
          className="-mx-2 flex flex-1 items-center gap-1 overflow-x-auto px-2 text-sm font-medium [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-end"
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
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/components/SiteHeader.tsx
git commit -m "feat(design): tokenize header + add theme toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: PageHeader primitive + adopt on two list pages

**Files:**
- Create: `apps/web/components/PageHeader.tsx`
- Modify: `apps/web/app/settlements/page.tsx`, `apps/web/app/market/page.tsx`

- [ ] **Step 1: Create the PageHeader**

Create `apps/web/components/PageHeader.tsx` (a fragment — drop-in for the existing `<h1>` + `<p>` pair, so adopting it changes nothing visually):

```tsx
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle != null && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );
}
```

- [ ] **Step 2: Adopt it on the settlements list page**

In `apps/web/app/settlements/page.tsx`, add the import after the existing `Pager` import line (`import { Pager } from "@/components/compendium/Pager";`):

```tsx
import { PageHeader } from "@/components/PageHeader";
```

Then replace:

```tsx
      <h1 className="text-3xl font-bold tracking-tight">Settlements</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} player settlements</p>
```

with:

```tsx
      <PageHeader title="Settlements" subtitle={`${total.toLocaleString()} player settlements`} />
```

- [ ] **Step 3: Adopt it on the market list page**

In `apps/web/app/market/page.tsx`, add after the `Pager` import (`import { Pager } from "@/components/compendium/Pager";`):

```tsx
import { PageHeader } from "@/components/PageHeader";
```

Then replace:

```tsx
      <h1 className="text-3xl font-bold tracking-tight">Market</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} traded items</p>
```

with:

```tsx
      <PageHeader title="Market" subtitle={`${total.toLocaleString()} traded items`} />
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/components/PageHeader.tsx "apps/web/app/settlements/page.tsx" apps/web/app/market/page.tsx
git commit -m "feat(design): shared PageHeader primitive (adopted on settlements + market)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Homepage live-stats query

**Files:**
- Create: `apps/web/lib/queries/home.ts`

- [ ] **Step 1: Create the query**

Create `apps/web/lib/queries/home.ts`:

```ts
import "server-only";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export interface HomeStats {
  settlements: number;
  players: number;
  empires: number;
  tradedItems: number;
}

/** Live counts for the homepage stat strip. */
export async function getHomeStats(): Promise<HomeStats> {
  const db = getDb();
  const [s] = await db.select({ c: count() }).from(schema.settlements);
  const [p] = await db.select({ c: count() }).from(schema.players);
  const [e] = await db.select({ c: count() }).from(schema.empires);
  const [m] = await db.select({ c: count() }).from(schema.marketItemSummary);
  return {
    settlements: Number(s.c),
    players: Number(p.c),
    empires: Number(e.c),
    tradedItems: Number(m.c),
  };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors (confirms `schema.settlements/players/empires/marketItemSummary` all resolve).

```bash
git add apps/web/lib/queries/home.ts
git commit -m "feat(design): homepage live-stats query

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Cinematic homepage

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Replace the homepage**

Replace the entire contents of `apps/web/app/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getHomeStats } from "@/lib/queries/home";
import { getAllPosts } from "@/lib/blog/posts";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "BitCraft Companion — live markets, settlements & maps for BitCraft Online",
  description:
    "The fast, comprehensive companion for BitCraft Online: live market prices, player settlements, empires, an interactive world map, and a crafting calculator.",
  alternates: { canonical: "/" },
};

const FEATURES: { href: string; title: string; desc: string }[] = [
  { href: "/market", title: "Market", desc: "Live order books, prices, and sold volume across every region." },
  { href: "/map", title: "World map", desc: "Interactive map of empires, territories, settlements, and biomes." },
  { href: "/settlements", title: "Settlements", desc: "Player claims ranked by tiles, supplies, and treasury." },
  { href: "/compendium", title: "Compendium", desc: "Every item, cargo, building, and recipe with real game icons." },
  { href: "/calculator", title: "Calculator", desc: "Expand any recipe into a full shopping list of raw materials." },
  { href: "/empires", title: "Empires", desc: "Empire power, treasury, members, and territory at a glance." },
];

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function Home() {
  const stats = await getHomeStats();
  const posts = getAllPosts().slice(0, 3);
  const statItems: [string, number][] = [
    ["Settlements", stats.settlements],
    ["Players", stats.players],
    ["Empires", stats.empires],
    ["Traded items", stats.tradedItems],
  ];

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_70%_0%,color-mix(in_oklch,var(--primary)_18%,var(--background))_0%,var(--background)_55%)]" />
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Master the supply economy.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            The fast, comprehensive companion for BitCraft Online — live markets, settlements, empires, an interactive
            world map, and a crafting calculator.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/map" className={buttonVariants({ size: "lg" })}>Explore the map →</Link>
            <Link href="/market" className="text-sm font-medium text-accent-teal hover:underline">Browse the market →</Link>
          </div>
        </div>
      </section>

      {/* Live-stat strip */}
      <section className="border-b border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 px-6 sm:grid-cols-4">
          {statItems.map(([label, value]) => (
            <div key={label} className="px-2 py-8 text-center">
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold text-primary sm:text-4xl">
                {value.toLocaleString()}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature tiles */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Everything in BitCraft, in one place
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
            >
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-foreground group-hover:text-primary">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest from the blog */}
      {posts.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Latest guides</h2>
            <Link href="/blog" className="text-sm font-medium text-accent-teal hover:underline">All posts →</Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {posts.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
              >
                <div className="text-xs text-muted-foreground">{fmtDate(p.frontmatter.date)} · {p.readingTime} min</div>
                <h3 className="mt-2 font-semibold text-foreground group-hover:text-primary">{p.frontmatter.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.frontmatter.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
```

(`text-accent-teal` works because Task 1 mapped `--color-accent-teal` in `@theme`. `buttonVariants` comes from the existing shadcn button. `PostMeta.frontmatter` has `title`/`date`/`description` and `readingTime` per `lib/blog/posts-util.ts`.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck`
Expected: no errors.

```bash
git add apps/web/app/page.tsx
git commit -m "feat(design): cinematic homepage (hero, live stats, feature tiles, blog row)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Full verification (build + both-theme click-through)

- [ ] **Step 1: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: all packages pass.

- [ ] **Step 2: Run the test suite (nothing should have regressed)**

Run: `pnpm test`
Expected: all existing tests pass (this phase added no unit tests).

- [ ] **Step 3: Production build**

Run: `pnpm --filter @bcc/web build`
Expected: build succeeds; `/` builds; no errors about `next-themes`, fonts, or tokens.

- [ ] **Step 4: Both-theme click-through (dev server)**

Run: `pnpm --filter @bcc/web dev` and open `http://localhost:3000`. Verify in BOTH themes (toggle in the header — confirm it persists across reload and does NOT flash the wrong theme on load):
- **Home** — hero gradient + headline (Josefin), live-stat numbers populated (Lexend tabular), feature tiles hover-lift, blog row, footer with the three emails.
- **A settlement detail**, **market list**, **map**, **a compendium list**, **a blog post** — readable text, AA contrast (no low-contrast cream-on-cream or gold-on-paper), header/footer correct, no page visibly regressed from the token swap.
- Check the gold primary buttons/links and teal secondary links read correctly in both themes.

Note any contrast problems (likely the rarity tints `bg-*-900/40` / badge `text-*-400` in light mode, per spec §12). Fix trivial ones here by mapping to tokens; log non-trivial section-specific issues for the per-section polish plan and call them out in the final report rather than silently leaving them.

- [ ] **Step 5: Final commit (only if Step 4 required token/contrast fixes)**

```bash
git add -A
git commit -m "fix(design): contrast tweaks from both-theme click-through

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage check

- §1 decisions (dark default + light toggle, gold+teal, Lexend tabular, Josefin/Lexend, cinematic hero) → Tasks 1, 2, 4, 8. ✓
- §3 tokens both themes, shadcn names reused, accent-teal + tabular-nums → Task 1. ✓
- §4 typography (Lexend wired, Josefin retained, heading rule) → Task 1 (heading rule) + Task 4 (fonts). ✓
- §5 theming mechanism (`next-themes`, default dark, toggle, no flash) → Tasks 2, 4, 5. ✓
- §6 header tokenized + toggle → Task 5. ✓
- §7 footer (brand, link groups, emails, disclaimer) → Task 3 + mounted in Task 4. ✓
- §8 shared primitives — PageHeader → Task 6; Button reuses existing `components/ui/button.tsx` (no new component needed); stat-card/table consistency comes free from the token swap (no new abstraction, per YAGNI). ✓
- §9 homepage (hero, live-stat strip, feature tiles, blog row, ISR) → Tasks 7 + 8. ✓
- §10 testing/verification (typecheck, build, both-theme click-through) → Task 9. ✓
- §7-spec out-of-scope (per-section polish, universal search, new data) — not implemented. ✓
