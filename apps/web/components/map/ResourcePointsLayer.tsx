"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { DomUtil } from "leaflet";
import { decimate } from "@/lib/map/tracking";

export interface TrackedPoints { key: string; color: string; xz: number[] } // xz = small-hex flat pairs

const MAX_DRAW_POINTS = 60_000;
const R = 2.5; // dot radius (px)

/**
 * Draws all tracked spawn points on one canvas in Leaflet's overlay pane.
 *
 * Contract: `tracked` MUST be referentially stable (memoize it in the consumer) —
 * every new array reference re-runs the effect and triggers a full repaint.
 */
export function ResourcePointsLayer({ tracked }: { tracked: TrackedPoints[] }) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = DomUtil.create("canvas") as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "450"; // above overlays, below markers/popups
    map.getPanes().overlayPane.appendChild(canvas);
    canvasRef.current = canvas;
    return () => { canvas.remove(); canvasRef.current = null; };
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const size = map.getSize();
      canvas.width = size.x; canvas.height = size.y;
      // Pin the canvas to the current view (overlayPane is translated as the map pans).
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      DomUtil.setPosition(canvas, topLeft);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Pad the bounds slightly so dots straddling the view edge don't pop in/out.
      const bounds = map.getBounds().pad(0.01);
      const budget = Math.max(2_000, Math.floor(MAX_DRAW_POINTS / Math.max(1, tracked.length)));
      for (const t of tracked) {
        // Cull BEFORE decimating: sample only what's in view, so zooming into a
        // dense area reveals more detail instead of a fixed global sample.
        // inView holds CHUNK coords ([x, z] pairs) — converted from small-hex here.
        const inView: number[] = [];
        for (let i = 0; i + 1 < t.xz.length; i += 2) {
          const cx = t.xz[i]! / 96, cz = t.xz[i + 1]! / 96; // small-hex -> chunk
          if (cz < bounds.getSouth() || cz > bounds.getNorth() || cx < bounds.getWest() || cx > bounds.getEast()) continue;
          inView.push(cx, cz);
        }
        const xz = decimate(inView, budget);
        ctx.fillStyle = t.color;
        ctx.beginPath(); // one batched path per track, single fill below
        for (let i = 0; i < xz.length; i += 2) {
          const p = map.latLngToContainerPoint([xz[i + 1]!, xz[i]!]); // [lat=z, lng=x], chunk coords
          ctx.moveTo(p.x + R, p.y); // moveTo avoids a connecting line between arcs
          ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };
    // The canvas is not a leaflet-zoom-animated element: during a zoom animation
    // the panes scale but our dots would stay frozen (misaligned). Clear on
    // zoomstart, repaint on moveend — Leaflet fires moveend right after zoomend
    // (same internal call), so listening to zoomend too would double-paint.
    const clear = () => { canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); };
    draw();
    map.on("moveend resize", draw);
    map.on("zoomstart", clear);
    return () => { map.off("moveend resize", draw); map.off("zoomstart", clear); };
  }, [map, tracked]);

  return null;
}
