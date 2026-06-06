"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const NAV: [string, string][] = [
  ["/compendium", "Compendium"],
  ["/calculator", "Calculator"],
  ["/map", "Map"],
  ["/empires", "Empires"],
  ["/players", "Players"],
  ["/leaderboards", "Leaderboards"],
  ["/blog", "Blog"],
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[#38373C] bg-[#1D1B22] shadow-[0_1px_0_0_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)] supports-[backdrop-filter]:bg-[#1D1B22]/95 supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6 sm:h-16">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="BitCraft Companion — home"
        >
          <Logo size={30} />
          <span className="font-[family-name:var(--font-display)] text-lg font-bold leading-none tracking-tight">
            <span className="text-[#E9DFC4] transition-colors group-hover:text-[#D5BB72]">
              BitCraft
            </span>{" "}
            <span className="text-[#D5BB72] transition-colors group-hover:text-[#B8932E]">
              Companion
            </span>
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
                    ? "text-[#D5BB72] after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[#D5BB72]"
                    : "text-[#747184] hover:text-[#E9DFC4]")
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
