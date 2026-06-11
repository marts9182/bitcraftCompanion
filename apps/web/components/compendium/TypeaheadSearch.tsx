"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { filterSuggestions, type SuggestEntry, type SuggestKind } from "@/lib/suggest";

/**
 * Search input with name suggestions — a drop-in upgrade for the plain `q`
 * input inside the compendium GET filter forms. Plain Enter still submits the
 * surrounding form exactly as before; picking a suggestion (click or
 * ArrowDown/ArrowUp + Enter) navigates straight to the entity detail page —
 * the fastest path when you don't know the exact name.
 *
 * The slim catalog is fetched lazily on first focus from /api/suggest/{kind}
 * and filtered client-side. Detail routes match the kind 1:1 (/{kind}/{slug}).
 */
export function TypeaheadSearch({
  kind,
  name,
  placeholder,
  defaultValue,
  className,
}: {
  kind: SuggestKind;
  name: string;
  placeholder: string;
  defaultValue?: string;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [entries, setEntries] = useState<SuggestEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const fetchStarted = useRef(false);

  // Lazy one-shot catalog fetch on first focus; reset the guard on failure so
  // the next focus retries.
  const loadCatalog = () => {
    if (fetchStarted.current) return;
    fetchStarted.current = true;
    fetch(`/api/suggest/${kind}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ v: number; entries: SuggestEntry[] }>) : Promise.reject(new Error(`${r.status}`))))
      .then((data) => setEntries(data.entries))
      .catch(() => {
        fetchStarted.current = false;
      });
  };

  const suggestions = open && entries ? filterSuggestions(entries, value) : [];
  // Typing reshuffles the list — never let the active index dangle past it.
  const activeIdx = active < suggestions.length ? active : -1;

  const go = (slug: string) => {
    setOpen(false);
    setActive(-1);
    router.push(`/${kind}/${slug}`);
  };

  return (
    /* onBlur (focusout) closes the dropdown when focus leaves the wrapper.
       Suggestion buttons preventDefault on mousedown so the input never blurs
       mid-click — Safari doesn't focus buttons on click (relatedTarget would
       be null), which would unmount the row before its click could fire. */
    <div
      className={`relative w-full ${className ?? "max-w-xs"}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <Input
        name={name}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
        onFocus={() => {
          loadCatalog();
          setOpen(true);
        }}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            if (suggestions.length > 0) setActive(Math.min(activeIdx + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(activeIdx - 1, -1));
          } else if (e.key === "Enter") {
            const picked = activeIdx >= 0 ? suggestions[activeIdx] : undefined;
            if (open && picked) {
              e.preventDefault(); // suggestion chosen — navigate instead of submitting q
              go(picked.slug);
            }
            // else: fall through to the form's normal q-search submit
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${placeholder} suggestions`}
          className="absolute z-50 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                tabIndex={-1}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-background ${
                  i === activeIdx ? "bg-background" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(s.slug)}
              >
                <span className="truncate">{s.name}</span>
                {s.tier !== null && s.tier >= 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">T{s.tier}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
