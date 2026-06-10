"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { DomUtil } from "leaflet";
import { decimate } from "@/lib/map/tracking";

export interface TrackedPoints { key: string; color: string; xz: number[] } // xz = small-hex flat pairs

const MAX_DRAW_POINTS = 60_000;

/** Draws all tracked spawn points on one canvas in Leaflet's overlay pane. */
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
      const bounds = map.getBounds();
      const budget = Math.max(2_000, Math.floor(MAX_DRAW_POINTS / Math.max(1, tracked.length)));
      for (const t of tracked) {
        ctx.fillStyle = t.color;
        const xz = decimate(t.xz, budget);
        for (let i = 0; i < xz.length; i += 2) {
          const cx = xz[i]! / 96, cz = xz[i + 1]! / 96; // small-hex -> chunk
          if (cz < bounds.getSouth() || cz > bounds.getNorth() || cx < bounds.getWest() || cx > bounds.getEast()) continue;
          const p = map.latLngToContainerPoint([cz, cx]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    // The canvas is not a leaflet-zoom-animated element: during a zoom animation
    // the panes scale but our dots would stay frozen (misaligned). Clear on
    // zoomstart, repaint on zoomend.
    const clear = () => { canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); };
    draw();
    map.on("moveend zoomend resize", draw);
    map.on("zoomstart", clear);
    return () => { map.off("moveend zoomend resize", draw); map.off("zoomstart", clear); };
  }, [map, tracked]);

  return null;
}
