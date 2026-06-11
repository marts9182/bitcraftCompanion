"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { buildPaletteResults, PALETTE_KIND_LABEL, type PaletteCatalogs } from "@/lib/palette";
import { SUGGEST_KINDS, SUGGEST_MIN_QUERY, type SuggestEntry, type SuggestKind } from "@/lib/suggest";

/**
 * Ctrl+K command palette: header chip + global keybindings + a modal search
 * over the static page list and the five /api/suggest catalogs (items, cargo,
 * recipes, resources, creatures — settlements/empires/players are a v1
 * follow-up, see lib/palette.ts).
 *
 * Catalogs are lazily fetched ON OPEN, once per session, cached module-level
 * so reopening (or other palette instances) never refetches. Filtering is
 * pure client-side (buildPaletteResults → filterSuggestions).
 *
 * The modal portals to document.body — the sticky header's backdrop-filter
 * creates a containing block that traps position:fixed children (same bug
 * MobileNav hit). Hand-rolled like the existing overlays: no portal/dialog
 * libraries.
 *
 * Header-chip decision: an always-visible chip in the header's right control
 * cluster (icon-only on small screens, icon + "Search" + Ctrl K kbd from sm:)
 * that opens the palette on click — it never collides with page-level search
 * UIs and doubles as the discoverability hint for the shortcut.
 */

// ---- module-level catalog cache (one fetch per kind per session) ----------
const catalogCache = new Map<SuggestKind, SuggestEntry[]>();
const inflight = new Set<SuggestKind>();

function ensureCatalogs(onLoaded: () => void) {
  for (const kind of SUGGEST_KINDS) {
    if (catalogCache.has(kind) || inflight.has(kind)) continue;
    inflight.add(kind);
    fetch(`/api/suggest/${kind}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ v: number; entries: SuggestEntry[] }>) : Promise.reject(new Error(`${r.status}`))))
      .then((data) => {
        catalogCache.set(kind, data.entries);
        onLoaded();
      })
      // Swallow failures; the kind simply stays absent and the next open retries.
      .catch(() => {})
      .finally(() => inflight.delete(kind));
  }
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Bumped when a lazily fetched catalog lands so results recompute.
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Close on route change (covers navigations the palette didn't initiate).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /** Open with a fresh query (state persists across closes — the portal unmounts, the component doesn't). */
  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  // Global keybindings: Ctrl/Cmd+K toggles; bare "/" opens when the user
  // isn't typing somewhere else (inputs, textareas, selects, contenteditable).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Bare Ctrl/Cmd+K only — Ctrl+Shift+K is the Firefox devtools console.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault();
        if (!open) openPalette();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openPalette]);

  // While open: kick off catalog fetches, remember + move focus, lock body
  // scroll, trap Tab inside the dialog (Escape is handled on the dialog
  // itself — focus always lives inside it).
  useEffect(() => {
    if (!open) return;
    ensureCatalogs(() => setCatalogVersion((v) => v + 1));
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" && dialogRef.current) {
        const els = dialogRef.current.querySelectorAll<HTMLElement>("input,a[href],button:not([disabled]):not([tabindex='-1'])");
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
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  const results = useMemo(
    () => {
      void catalogVersion; // results depend on the cache contents, not just the query
      const catalogs: PaletteCatalogs = {};
      for (const [kind, entries] of catalogCache) catalogs[kind] = entries;
      return buildPaletteResults(query, catalogs);
    },
    [query, catalogVersion],
  );
  // Typing reshuffles the list — never let the active index dangle past it.
  const activeIdx = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  // Keep the active option visible in the scrollable listbox.
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    document.getElementById(`${listId}-${activeIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIdx, listId]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search the site (Ctrl+K)"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:border sm:border-border sm:bg-background/60 sm:px-2.5"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sm:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/50 p-4 pt-[12vh] supports-[backdrop-filter]:backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Site search"
              className="mx-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (results.length > 0) setActive(Math.min(activeIdx + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive(Math.max(activeIdx - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const picked = activeIdx >= 0 ? results[activeIdx] : undefined;
                  if (picked) go(picked.href);
                }
              }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  ref={inputRef}
                  value={query}
                  placeholder="Search pages, items, recipes, resources…"
                  aria-label="Search pages, items, recipes, resources"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={results.length > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
                  className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                />
                <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                  Esc
                </kbd>
              </div>

              {results.length > 0 ? (
                <ul id={listId} role="listbox" aria-label="Search results" className="overflow-y-auto p-1.5">
                  {results.map((r, i) => (
                    <li key={`${r.kind}:${r.href}`} id={`${listId}-${i}`} role="option" aria-selected={i === activeIdx}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm ${
                          i === activeIdx ? "bg-background" : "hover:bg-background"
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(r.href)}
                      >
                        <span className="truncate">
                          {r.verb && <span className="text-muted-foreground">{r.verb} · </span>}
                          {r.label}
                          {r.tier !== null && r.tier >= 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">T{r.tier}</span>
                          )}
                        </span>
                        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {PALETTE_KIND_LABEL[r.kind]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {query.trim().length >= SUGGEST_MIN_QUERY
                    ? `No matches for “${query.trim()}”.`
                    : "Type to search pages, items, cargo, recipes, resources and creatures."}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
