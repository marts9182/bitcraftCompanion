"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinderResource, FinderCreature, TrackedRef } from "@/components/map/MapFinderPanel";
import type { TrackedPoints } from "@/components/map/ResourcePointsLayer";
import type { RegionRect } from "@/lib/queries/map";
import { trackColor, MAX_TRACKED } from "./tracking";

// Base URL for the static spawn-position files. NEXT_PUBLIC_ vars are inlined
// at build time, so this must be read at module scope in a client file.
const DATA_BASE = process.env.NEXT_PUBLIC_MAP_DATA_BASE ?? "/map-data";

/**
 * Resource/creature tracking state for the world map (finder panel → canvas
 * dots): which refs are tracked, their lazily-fetched spawn positions, and the
 * toggle/clear actions. Extracted verbatim from WorldMap.
 */
export function useTrackedPoints({ resourceCatalog, creatureCatalog, regions, selectedId, initialTracked }: {
  resourceCatalog: FinderResource[];
  creatureCatalog: FinderCreature[];
  regions: RegionRect[];
  /** Focused region id (narrows fetches/points to that region), or null for all. */
  selectedId: number | null;
  initialTracked?: TrackedRef[];
}): { tracked: TrackedRef[]; trackedPoints: TrackedPoints[]; shownPoints: number; toggle: (ref: TrackedRef) => void; clearAll: () => void } {
  const [tracked, setTracked] = useState<TrackedRef[]>(initialTracked ?? []);
  // Loaded spawn positions, keyed `{kind}:{id}:r{region}` (flat small-hex [x,z,…]).
  const [pointsByKey, setPointsByKey] = useState<Map<string, number[]>>(new Map());
  // Keys already requested (in flight, loaded, or 404'd). 404s stay burned for
  // the mount; network failures are evicted so a later effect run retries them.
  const requestedKeysRef = useRef<Set<string>>(new Set());
  // One enemy file per region holds ALL creature types — cache the whole-file
  // promise so N tracked creatures in a region cost one fetch, not N.
  const enemyFilesRef = useRef<Map<number, Promise<Record<string, number[]>>>>(new Map());
  // Results are keyed by immutable content (id+region), so they never go stale —
  // only an unmount makes the setState unwanted.
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const resourceById = useMemo(() => new Map(resourceCatalog.map((r) => [r.id, r])), [resourceCatalog]);
  const creatureByType = useMemo(() => new Map(creatureCatalog.map((c) => [c.enemyType, c])), [creatureCatalog]);
  const regionIdSet = useMemo(() => new Set(regions.map((r) => r.id)), [regions]);

  // A tracked entry only has data in the regions listed in its spawnCounts —
  // intersect with known regions, and narrow to the focused region when set.
  const regionsFor = useCallback((t: TrackedRef): number[] => {
    const meta = t.kind === "resource" ? resourceById.get(t.id) : creatureByType.get(t.id);
    if (!meta) return [];
    const ids = Object.keys(meta.spawnCounts).map(Number).filter((id) => regionIdSet.has(id));
    return selectedId !== null ? ids.filter((id) => id === selectedId) : ids;
  }, [resourceById, creatureByType, regionIdSet, selectedId]);

  // Lazily fetch position files for tracked refs. A 404 just means no spawn
  // data for that id/region (key stays burned); a REJECTION is transient
  // (network), so we evict the key/file-promise and a later effect run retries.
  useEffect(() => {
    for (const t of tracked) {
      for (const region of regionsFor(t)) {
        const key = `${t.kind}:${t.id}:r${region}`;
        if (requestedKeysRef.current.has(key)) continue;
        requestedKeysRef.current.add(key);
        const store = (xz: number[]) => { if (mountedRef.current) setPointsByKey((m) => new Map(m).set(key, xz)); };
        if (t.kind === "resource") {
          fetch(`${DATA_BASE}/resources/r${region}/${t.id}.json`)
            .then((r) => (r.ok ? (r.json() as Promise<{ xz?: number[] }>) : null))
            .then((j) => { if (j) store(j.xz ?? []); })
            .catch(() => { requestedKeysRef.current.delete(key); });
        } else {
          let file = enemyFilesRef.current.get(region);
          if (!file) {
            file = fetch(`/map/enemies/r${region}.json`)
              .then((r) => (r.ok ? (r.json() as Promise<{ types?: Record<string, number[]> }>) : null))
              .then((j) => j?.types ?? {});
            // Rejected file promise must not stay cached, or the region is burned.
            file.catch(() => { enemyFilesRef.current.delete(region); });
            enemyFilesRef.current.set(region, file);
          }
          file
            .then((types) => store(types[String(t.id)] ?? []))
            .catch(() => { requestedKeysRef.current.delete(key); });
        }
      }
    }
  }, [tracked, regionsFor]);

  // ResourcePointsLayer contract: `tracked` MUST be referentially stable — memoize.
  const trackedPoints = useMemo<TrackedPoints[]>(() =>
    tracked.map((t, i) => {
      const parts: number[][] = [];
      for (const region of regionsFor(t)) {
        const part = pointsByKey.get(`${t.kind}:${t.id}:r${region}`);
        if (part && part.length) parts.push(part);
      }
      // concat, not push(...spread): region arrays can be 100k+ numbers (stack limit).
      const xz = parts.length === 1 ? parts[0]! : ([] as number[]).concat(...parts);
      const meta = t.kind === "resource" ? resourceById.get(t.id) : creatureByType.get(t.id);
      // Same fallback the panel chips use for an unknown id.
      const name = meta?.name ?? `${t.kind} ${t.id}`;
      return { key: `${t.kind}:${t.id}`, color: trackColor(i), name, xz };
    }),
  [tracked, pointsByKey, regionsFor, resourceById, creatureByType]);

  const shownPoints = useMemo(() => trackedPoints.reduce((n, t) => n + Math.floor(t.xz.length / 2), 0), [trackedPoints]);

  const toggle = useCallback((ref: TrackedRef) => {
    setTracked((cur) => {
      const exists = cur.some((t) => t.kind === ref.kind && t.id === ref.id);
      if (exists) return cur.filter((t) => !(t.kind === ref.kind && t.id === ref.id));
      if (cur.length >= MAX_TRACKED) return cur; // at cap — panel disables adds too
      return [...cur, ref];
    });
  }, []);
  const clearAll = useCallback(() => setTracked([]), []);

  return { tracked, trackedPoints, shownPoints, toggle, clearAll };
}
