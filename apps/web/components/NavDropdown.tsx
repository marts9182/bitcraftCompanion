"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { isActive, type NavLink } from "./nav-items";

export function NavDropdown({ label, items, pathname }: { label: string; items: NavLink[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const groupActive = items.some((i) => isActive(pathname, i.href));

  // Close on route change (state adjusted during render, per React docs:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

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
