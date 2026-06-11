"use client";
import { useMemo, useRef, useState } from "react";
import { trackColor, MAX_TRACKED } from "@/lib/map/tracking";
import { formatDuration } from "@/lib/calculator/format";

// Slim catalog shapes threaded page → MapClient → WorldMap → here. Defined ONCE
// in this file; everyone else imports them.
export interface FinderResource { id: number; slug: string; name: string; category: string | null; tier: number | null; spawnCounts: Record<string, number>; respawnSeconds: number | null }
export interface FinderCreature { enemyType: number; slug: string; name: string; tier: number | null; spawnCounts: Record<string, number> }
export interface TrackedRef { kind: "resource" | "creature"; id: number }

const hasSpawns = (spawnCounts: Record<string, number>): boolean => Object.keys(spawnCounts).length > 0;

/** Tooltip for resources with respawn data (catalog nulls it for never-respawning nodes). */
const respawnTitle = (r: FinderResource): string | undefined =>
  r.respawnSeconds != null && r.respawnSeconds > 0 ? `Respawns ${formatDuration(r.respawnSeconds)}` : undefined;

/**
 * Finder panel rendered ABOVE the map: name search (resources + creatures),
 * browse-by-category (our differentiator — bitjita only has name search), and
 * the color-coded tracking chips that drive ResourcePointsLayer.
 */
export function MapFinderPanel({ resources, creatures, tracked, onToggle, onClear, showCopyLink, showCategoryBrowse = true }: {
  resources: FinderResource[];
  creatures: FinderCreature[];
  tracked: TrackedRef[];
  onToggle: (ref: TrackedRef) => void;
  onClear: () => void;
  /** WorldMap mirrors tracking/region state into the URL — show "copy link" when there's a view worth sharing. */
  showCopyLink?: boolean;
  /** Compact detail-page embeds drop the category-browse select (search + chips stay). */
  showCategoryBrowse?: boolean;
}) {
  const [q, setQ] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only entries with spawn data are trackable — the rest are noise here.
  const trackableResources = useMemo(() => resources.filter((r) => hasSpawns(r.spawnCounts)), [resources]);
  const trackableCreatures = useMemo(() => creatures.filter((c) => hasSpawns(c.spawnCounts)), [creatures]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of trackableResources) if (r.category) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [trackableResources]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return { res: [] as FinderResource[], cre: [] as FinderCreature[] };
    return {
      res: trackableResources.filter((r) => r.name.toLowerCase().includes(needle)).slice(0, 12),
      cre: trackableCreatures.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 6),
    };
  }, [q, trackableResources, trackableCreatures]);

  const categoryChips = useMemo(() => {
    if (!openCategory) return [];
    return trackableResources
      .filter((r) => r.category === openCategory)
      .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name));
  }, [openCategory, trackableResources]);

  const isTracked = (kind: TrackedRef["kind"], id: number) => tracked.some((t) => t.kind === kind && t.id === id);
  const trackedIndex = (kind: TrackedRef["kind"], id: number) => tracked.findIndex((t) => t.kind === kind && t.id === id);
  const atCap = tracked.length >= MAX_TRACKED;
  const capTitle = `Tracking limit reached (${MAX_TRACKED}) — remove one first`;

  const pick = (ref: TrackedRef) => {
    onToggle(ref);
    setQ("");
    inputRef.current?.focus();
  };

  return (
    <div className="mb-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        {/* onBlur (focusout) closes the dropdown when focus leaves the wrapper.
            Result buttons preventDefault on mousedown so the input never blurs
            mid-click — Safari doesn't focus buttons on click (relatedTarget would
            be null), which would unmount the row before its click could fire. */}
        <div
          className="relative w-full sm:w-80"
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setQ(""); }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
            placeholder="Find resources & creatures (e.g. iron, oak, jakyl)…"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            aria-label="Find resources and creatures on the map"
          />
          {(results.res.length > 0 || results.cre.length > 0) && (
            <ul className="absolute z-[1200] mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
              {results.res.map((r) => {
                const on = isTracked("resource", r.id);
                const disabled = atCap && !on;
                return (
                  <li key={`r${r.id}`}>
                    <button
                      type="button"
                      disabled={disabled}
                      title={disabled ? capTitle : respawnTitle(r)}
                      aria-pressed={on}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick({ kind: "resource", id: r.id })}
                    >
                      <span className="flex items-center gap-1.5">
                        {on && <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: trackColor(trackedIndex("resource", r.id)) }} />}
                        {r.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {[r.category, r.tier !== null ? `T${r.tier}` : null].filter(Boolean).join(" · ") || "Resource"}
                      </span>
                    </button>
                  </li>
                );
              })}
              {results.cre.map((c) => {
                const on = isTracked("creature", c.enemyType);
                const disabled = atCap && !on;
                return (
                  <li key={`c${c.enemyType}`}>
                    <button
                      type="button"
                      disabled={disabled}
                      title={disabled ? capTitle : undefined}
                      aria-pressed={on}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick({ kind: "creature", id: c.enemyType })}
                    >
                      <span className="flex items-center gap-1.5">
                        {on && <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: trackColor(trackedIndex("creature", c.enemyType)) }} />}
                        {c.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.tier !== null ? `Creature · T${c.tier}` : "Creature"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Browse by category — the thing bitjita's map doesn't have. */}
        {showCategoryBrowse && (
          <select
            value={openCategory ?? ""}
            onChange={(e) => setOpenCategory(e.target.value || null)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            aria-label="Browse resources by category"
          >
            <option value="">Browse category…</option>
            {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        )}

        {tracked.length > 0 && (
          <button type="button" onClick={onClear} className="h-9 text-primary underline">Clear all</button>
        )}
        {showCopyLink && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href)
                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
                // Clipboard can be unavailable (non-HTTPS, permission denied) —
                // fall back to showing the URL so the user can copy it manually.
                .catch(() => { window.prompt("Copy this link:", window.location.href); });
            }}
            className="h-9 text-primary underline"
          >
            {copied ? "Copied!" : "Copy link to view"}
          </button>
        )}
      </div>

      {openCategory && (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
          {categoryChips.map((r) => {
            const on = isTracked("resource", r.id);
            const disabled = atCap && !on;
            return (
              <button
                key={r.id}
                type="button"
                disabled={disabled}
                title={disabled ? capTitle : respawnTitle(r)}
                onClick={() => onToggle({ kind: "resource", id: r.id })}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-primary bg-primary/15" : "border-border hover:bg-background"}`}
              >
                {r.name}{r.tier !== null && <span className="text-muted-foreground"> T{r.tier}</span>}
              </button>
            );
          })}
        </div>
      )}

      {tracked.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tracked.map((t) => {
            const meta = t.kind === "resource" ? resources.find((r) => r.id === t.id) : creatures.find((c) => c.enemyType === t.id);
            const name = meta?.name ?? `${t.kind} ${t.id}`;
            return (
              <span key={`${t.kind}${t.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: trackColor(trackedIndex(t.kind, t.id)) }} />
                {name}
                <button type="button" aria-label={`Stop tracking ${name}`} onClick={() => onToggle(t)} className="text-muted-foreground hover:text-foreground">✕</button>
              </span>
            );
          })}
          {atCap && <span className="text-xs text-muted-foreground">Tracking limit reached ({MAX_TRACKED}).</span>}
        </div>
      )}
    </div>
  );
}
