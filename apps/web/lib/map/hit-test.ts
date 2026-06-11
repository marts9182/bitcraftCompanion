// Pure hit-testing for the resource-points canvas. The layer is
// pointer-events-none (one canvas, no per-dot DOM), so clicks land on the map
// and must be resolved manually against the points the LAST draw pass actually
// rendered (post cull/decimate) — not the full tracked set.

export interface DrawnTrack {
  key: string;
  color: string;
  name: string;
  /** Flat [x, z, …] SMALL-HEX pairs — exactly the points the draw pass rendered. */
  xz: number[];
}

export interface PointHit {
  track: DrawnTrack;
  /** Small-hex coordinates of the hit point (formatGameCoords input). */
  x: number;
  z: number;
}

/**
 * Nearest drawn point within `radiusPx` of a click, in CONTAINER-PIXEL space.
 * `project` maps a point's small-hex (x, z) to container pixels — injected so
 * the math stays pure (the layer passes Leaflet's latLngToContainerPoint).
 * Radius is inclusive; exact ties keep the first candidate. Returns null on a
 * miss so the caller can leave the click to other layers.
 */
export function findNearestPoint(
  tracks: readonly DrawnTrack[],
  clickX: number,
  clickY: number,
  project: (x: number, z: number) => { x: number; y: number },
  radiusPx: number,
): PointHit | null {
  const r2 = radiusPx * radiusPx;
  let best: PointHit | null = null;
  let bestD2 = Infinity;
  for (const t of tracks) {
    for (let i = 0; i + 1 < t.xz.length; i += 2) {
      const p = project(t.xz[i]!, t.xz[i + 1]!);
      const dx = p.x - clickX;
      const dy = p.y - clickY;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 >= bestD2) continue;
      best = { track: t, x: t.xz[i]!, z: t.xz[i + 1]! };
      bestD2 = d2;
    }
  }
  return best;
}
