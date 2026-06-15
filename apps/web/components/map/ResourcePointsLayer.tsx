"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { DomUtil, popup, type LeafletMouseEvent } from "leaflet";
import { decimate } from "@/lib/map/tracking";
import { findNearestPoint, type DrawnTrack } from "@/lib/map/hit-test";
import { formatGameCoords } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
// Calibrated small-hex → chunk conversion, shared with the server-side map
// queries so the offset can never drift between layers. Imported from the
// client-safe `world/coords` subpath (the package root pulls in server-only code).
import { smallHexToChunk } from "@bcc/shared/world/coords";

export interface TrackedPoints { key: string; color: string; name: string; xz: number[] } // xz = small-hex flat pairs

const MAX_DRAW_POINTS = 60_000;
const R = 2.5; // dot radius (px)
const HIT_RADIUS_PX = 8; // click-to-dot slop, container px

/**
 * Popup body for a clicked spawn point: color dot + tracked name, the location
 * in GAME coordinates (large-tile N/E — what the game itself displays), and a
 * Copy button. Built as plain DOM (not React) because Leaflet owns the popup.
 */
function buildPopupContent(track: DrawnTrack, coords: string): HTMLElement {
  const el = document.createElement("div");
  const line1 = document.createElement("div");
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:9999px;margin-right:6px;background:${track.color};`;
  const name = document.createElement("strong");
  name.textContent = track.name;
  line1.append(dot, name);
  const line2 = document.createElement("div");
  line2.style.marginTop = "2px";
  const coordsSpan = document.createElement("span");
  coordsSpan.textContent = coords;
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  // Match the default Leaflet popup chrome (white card, #333 text) rather than
  // the site theme — same as the settlements popup next door.
  copyBtn.style.cssText = "margin-left:8px;padding:0 6px;font-size:11px;line-height:16px;color:#333;background:#fff;border:1px solid #999;border-radius:4px;cursor:pointer;";
  copyBtn.addEventListener("click", () => {
    void copyText(coords, "Copy these coordinates:").then((ok) => {
      if (!ok) return;
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
    });
  });
  line2.append(coordsSpan, copyBtn);
  el.append(line1, line2);
  return el;
}

/**
 * Draws all tracked spawn points on one canvas in Leaflet's overlay pane, and
 * resolves map clicks against the drawn dots (the canvas is pointer-events-none,
 * so hits are computed manually — see the click effect below).
 *
 * Contract: `tracked` MUST be referentially stable (memoize it in the consumer) —
 * every new array reference re-runs the effect and triggers a full repaint.
 */
export function ResourcePointsLayer({ tracked }: { tracked: TrackedPoints[] }) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // What the LAST draw pass actually rendered (post cull/decimate), small-hex
  // pairs + track metadata. The click handler hit-tests against exactly this,
  // so clicks only ever land on visible dots.
  const drawnRef = useRef<DrawnTrack[]>([]);

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
      // Bounds are CHUNK coords ([lat=z, lng=x]); convert each point to chunk space
      // via the calibrated decode and cull there. Kept points stay in RAW small-hex
      // for the click handler (formatGameCoords takes small-hex; no lossy round-trip).
      const bounds = map.getBounds().pad(0.01);
      const south = bounds.getSouth(), north = bounds.getNorth();
      const west = bounds.getWest(), east = bounds.getEast();
      const budget = Math.max(2_000, Math.floor(MAX_DRAW_POINTS / Math.max(1, tracked.length)));
      const drawn: DrawnTrack[] = [];
      for (const t of tracked) {
        // Cull BEFORE decimating: sample only what's in view, so zooming into a
        // dense area reveals more detail instead of a fixed global sample.
        const inView: number[] = [];
        for (let i = 0; i + 1 < t.xz.length; i += 2) {
          const x = t.xz[i]!, z = t.xz[i + 1]!;
          const c = smallHexToChunk(x, z);
          if (c.z < south || c.z > north || c.x < west || c.x > east) continue;
          inView.push(x, z);
        }
        const xz = decimate(inView, budget);
        drawn.push({ key: t.key, color: t.color, name: t.name, xz });
        ctx.fillStyle = t.color;
        ctx.beginPath(); // one batched path per track, single fill below
        for (let i = 0; i < xz.length; i += 2) {
          // Calibrated small-hex → chunk, then [lat=z, lng=x] in chunk coords.
          const c = smallHexToChunk(xz[i]!, xz[i + 1]!);
          const p = map.latLngToContainerPoint([c.z, c.x]);
          ctx.moveTo(p.x + R, p.y); // moveTo avoids a connecting line between arcs
          ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      drawnRef.current = drawn;
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

  // Click-to-popup. Runs on the MAP's click (the canvas swallows nothing):
  // nearest drawn dot within HIT_RADIUS_PX wins; a miss does nothing, leaving
  // the click to Leaflet's defaults and other layers. A marker popup (e.g. a
  // settlement) opened by the same click only loses to us when a tracked dot
  // sits within the hit radius — nearest-content-wins is acceptable there.
  useEffect(() => {
    const onClick = (e: LeafletMouseEvent) => {
      const hit = findNearestPoint(
        drawnRef.current,
        e.containerPoint.x,
        e.containerPoint.y,
        (x, z) => {
          const c = smallHexToChunk(x, z);
          return map.latLngToContainerPoint([c.z, c.x]);
        },
        HIT_RADIUS_PX,
      );
      if (!hit) return;
      const c = smallHexToChunk(hit.x, hit.z);
      popup()
        .setLatLng([c.z, c.x])
        .setContent(buildPopupContent(hit.track, formatGameCoords(hit.x, hit.z)))
        .openOn(map);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map]);

  return null;
}
