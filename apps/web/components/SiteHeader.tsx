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
