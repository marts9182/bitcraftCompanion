"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { NAV, isNavGroup, isActive, type NavLink } from "./nav-items";
import { useHydrated } from "@/lib/use-hydrated";

function Section({ label, links, pathname }: { label: string; links: NavLink[]; pathname: string }) {
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

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mounted = useHydrated();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on route change (state adjusted during render, per React docs:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

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
              <Section label="Browse" links={topLinks} pathname={pathname} />
              {groups.map((g) => (
                <Section key={g.label} label={g.label} links={g.items} pathname={pathname} />
              ))}
              {blog && <Section label="More" links={[blog]} pathname={pathname} />}
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
