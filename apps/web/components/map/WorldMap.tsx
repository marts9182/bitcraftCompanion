"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, LayersControl, LayerGroup, CircleMarker, Marker, Rectangle, Polyline, ImageOverlay, Popup, Tooltip, useMap } from "react-leaflet";
import { CRS, Icon, divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ClaimPoint, RegionRect, TerritoryCell, Watchtower, EmpireTerritory } from "@/lib/queries/map";
import type { TerrainOverlay } from "@/app/map/page";

// CHUNK coordinates. CRS.Simple uses [lat,lng]; map game (x,z) -> [z, x]. The
// terrain image is rendered north-up to match (renderer flips its rows), so the
// whole map reads the right way up.
const pt = (x: number, z: number): [number, number] => [z, x];

const watchtowerIcon = new Icon({ iconUrl: "/map/watchtower.webp", iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] });
// Invisible DOM anchor for permanent text labels (canvas CircleMarkers can't host a Tooltip).
const emptyIcon = divIcon({ className: "", html: "", iconSize: [0, 0] });

// Only label empires with a meaningful footprint, so the world view stays legible.
const EMPIRE_LABEL_MIN_CHUNKS = 180;

// Biome key — colours MUST match scripts/render-terrain.py BIOME_PALETTE.
// `id` is the biome_type used by the per-chunk highlight grid (terrain-biomes.json).
// "Rivers & lakes" is a water overlay, not a biome (id null → not highlightable).
const BIOME_LEGEND: { id: number | null; name: string; color: string }[] = [
  { id: 1, name: "Calm Forest", color: "#4a603a" },
  { id: 2, name: "Pine Woods", color: "#3a5038" },
  { id: 14, name: "Sapwoods", color: "#60844a" },
  { id: 13, name: "Jungle", color: "#3c6e48" },
  { id: 8, name: "Swamp", color: "#566442" },
  { id: 11, name: "Safe Meadows", color: "#9eb06e" },
  { id: 4, name: "Breezy Grasslands", color: "#8a9e60" },
  { id: 5, name: "Autumn Forest", color: "#967840" },
  { id: 7, name: "Desert Wasteland", color: "#b29a66" },
  { id: 9, name: "Rocky Garden", color: "#8c8474" },
  { id: 6, name: "Misty Tundra", color: "#96968e" },
  { id: 3, name: "Snowy Peaks", color: "#e4e8ec" },
  { id: 12, name: "Cave", color: "#46404a" },
  { id: null, name: "Rivers & lakes", color: "#4e7896" },
  { id: 10, name: "Open Ocean", color: "#344a60" },
];

interface BiomeGrid { region: number; w: number; h: number; grid: number[]; }

// Build a chunk-resolution highlight image (data URL) for one region: cells whose
// dominant biome == `biome` get the highlight colour, the rest stay transparent.
// The grid is north-up (row 0 = max z), matching the terrain overlay's bounds.
function biomeHighlightUrl(g: BiomeGrid, biome: number, color: string): string | null {
  const cv = document.createElement("canvas");
  cv.width = g.w; cv.height = g.h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const r = parseInt(color.slice(1, 3), 16), gg = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  const img = ctx.createImageData(g.w, g.h);
  let any = false;
  for (let i = 0; i < g.grid.length; i++) {
    if (g.grid[i] !== biome) continue;
    any = true;
    const o = i * 4;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 235;
  }
  if (!any) return null;
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

export const regionLabel = (r: RegionRect): string => r.name ?? `Region ${r.id}`;
export const sortRegions = (regions: RegionRect[]): RegionRect[] =>
  [...regions].sort((a, b) => regionLabel(a).localeCompare(regionLabel(b), undefined, { numeric: true }));

// Pans/zooms the Leaflet map when the selected region changes. Lives inside
// <MapContainer> so it can read the map via useMap().
function FlyToRegion({ region, worldBounds }: { region: RegionRect | null; worldBounds: [[number, number], [number, number]] }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // skip initial mount
    if (region) map.flyToBounds([pt(region.x0, region.z0), pt(region.x1, region.z1)], { padding: [40, 40], maxZoom: 2 });
    else map.flyToBounds(worldBounds);
  }, [region, map, worldBounds]);
  return null;
}

export function WorldMap({ claims, regions, territory, watchtowers, empires, terrain }: {
  claims: ClaimPoint[]; regions: RegionRect[]; territory: TerritoryCell[]; watchtowers: Watchtower[]; empires: EmpireTerritory[]; terrain: TerrainOverlay[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedBiome, setSelectedBiome] = useState<number | null>(null);
  const [biomeGrids, setBiomeGrids] = useState<Map<number, BiomeGrid> | null>(null);

  // Lazy-load the per-chunk biome grids the first time a biome is highlighted.
  useEffect(() => {
    if (selectedBiome === null || biomeGrids) return;
    let alive = true;
    fetch("/map/terrain-biomes.json")
      .then((r) => r.json() as Promise<BiomeGrid[]>)
      .then((list) => { if (alive) setBiomeGrids(new Map(list.map((g) => [g.region, g]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [selectedBiome, biomeGrids]);

  const biomeColor = BIOME_LEGEND.find((b) => b.id === selectedBiome)?.color ?? "#ffd84d";
  const biomeHighlights = useMemo(() => {
    if (selectedBiome === null || !biomeGrids) return [];
    return terrain
      .map((t) => { const g = biomeGrids.get(t.region); const url = g ? biomeHighlightUrl(g, selectedBiome, biomeColor) : null; return url ? { region: t.region, url, bounds: t.bounds } : null; })
      .filter((x): x is { region: number; url: string; bounds: TerrainOverlay["bounds"] } => x !== null);
  }, [selectedBiome, biomeGrids, terrain, biomeColor]);

  // Fit bounds to the region extent (chunk coords). Fallback to a default if empty.
  const xs = regions.flatMap((r) => [r.x0, r.x1]);
  const zs = regions.flatMap((r) => [r.z0, r.z1]);
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1000;
  const minZ = zs.length ? Math.min(...zs) : 0, maxZ = zs.length ? Math.max(...zs) : 1000;
  const worldBounds = useMemo<[[number, number], [number, number]]>(
    () => [pt(minX, minZ), pt(maxX, maxZ)],
    [minX, minZ, maxX, maxZ],
  );

  const sorted = useMemo(() => sortRegions(regions), [regions]);
  const selected = regions.find((r) => r.id === selectedId) ?? null;
  const settlements = useMemo(() => claims.filter((c) => c.kind === "settlement"), [claims]);
  const landmarks = useMemo(() => claims.filter((c) => c.kind === "landmark"), [claims]);

  return (
    <div>
      {/* Region focus selector — lives OFF the map (above it), not floating over it. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="region-focus" className="text-muted-foreground">Focus region</label>
        <select
          id="region-focus"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-card px-2 text-sm text-foreground sm:w-auto sm:min-w-[180px]"
        >
          <option value="">All regions</option>
          {sorted.map((r) => <option key={r.id} value={r.id}>{regionLabel(r)}</option>)}
        </select>
        {selectedId !== null && (
          <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-primary underline">
            Show all
          </button>
        )}
      </div>

      <style>{`.empire-label{background:transparent;border:none;box-shadow:none;padding:0;color:#fff;font-weight:600;font-size:11px;white-space:nowrap;text-shadow:0 0 3px #000,0 0 4px #000,0 1px 2px #000;}.empire-label::before{display:none;}`}</style>

      <MapContainer
        crs={CRS.Simple}
        bounds={worldBounds}
        preferCanvas
        minZoom={-3}
        maxZoom={6}
        className="h-[70vh] min-h-[420px] rounded-lg"
        style={{ background: "var(--card)" }}
      >
        <FlyToRegion region={selected} worldBounds={worldBounds} />

        {/* Biome terrain base (per-region images) — always-on bottom layer.
            Dimmed when a biome is highlighted so the highlight stands out. */}
        {terrain.map((t) => <ImageOverlay key={t.region} url={t.url} bounds={t.bounds} opacity={selectedBiome === null ? 1 : 0.3} />)}
        {/* Click-to-highlight: the selected biome, chunk-resolution, over the dimmed terrain. */}
        {biomeHighlights.map((h) => <ImageOverlay key={`hl-${h.region}`} url={h.url} bounds={h.bounds} zIndex={5} />)}

        <LayersControl position="topright">
          {/* Empire borders + names — the headline overlay. */}
          <LayersControl.Overlay name={`Empire borders (${empires.length})`} checked>
            <LayerGroup>
              {empires.map((e) => (
                <Polyline
                  key={e.id}
                  positions={e.segments.map((s) => [pt(s[0][0], s[0][1]), pt(s[1][0], s[1][1])])}
                  pathOptions={{ color: e.color, weight: 1.5, opacity: 0.85 }}
                />
              ))}
              {empires.filter((e) => e.chunks >= EMPIRE_LABEL_MIN_CHUNKS).map((e) => (
                <Marker key={`l-${e.id}`} position={pt(e.labelX, e.labelZ)} icon={emptyIcon} interactive={false}>
                  <Tooltip permanent direction="center" className="empire-label">{e.name}</Tooltip>
                </Marker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Empire territory fill (the solid colours) — off by default; terrain is the base. */}
          <LayersControl.Overlay name={`Empire territory fill (${territory.length.toLocaleString()})`}>
            <LayerGroup>
              {territory.map((c, i) => (
                <Rectangle key={i} bounds={[pt(c.x0, c.z0), pt(c.x0 + 1, c.z0 + 1)]} pathOptions={{ stroke: false, fillColor: c.color, fillOpacity: 0.5 }} />
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Region outlines + selected-region highlight. */}
          <LayersControl.Overlay name="Region outlines" checked>
            <LayerGroup>
              {regions.map((r) => {
                const isSel = r.id === selectedId;
                return (
                  <Rectangle
                    key={r.id}
                    bounds={[pt(r.x0, r.z0), pt(r.x1, r.z1)]}
                    pathOptions={isSel
                      ? { color: "#F5C451", weight: 3, fill: false }
                      : { color: "#E9DFC4", weight: 1, opacity: 0.45, fill: false }}
                  />
                );
              })}
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Settlements (real player claims) — off by default. */}
          <LayersControl.Overlay name={`Settlements (${settlements.length.toLocaleString()})`}>
            <LayerGroup>
              {settlements.map((c) => (
                <CircleMarker key={c.id} center={pt(c.x, c.z)} radius={3} pathOptions={{ color: "#D5BB72", weight: 1, fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>{c.name}</strong>
                    <br />
                    {c.tiles.toLocaleString()} tiles · treasury {c.treasury.toLocaleString()}
                    <br />
                    <a href={`/settlements/${c.id}`}>Details →</a>
                  </Popup>
                </CircleMarker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Landmarks / points of interest (ruins, caves, temples) — off by default. */}
          <LayersControl.Overlay name={`Landmarks (${landmarks.length.toLocaleString()})`}>
            <LayerGroup>
              {landmarks.map((c) => (
                <CircleMarker key={c.id} center={pt(c.x, c.z)} radius={2} pathOptions={{ color: "#8fb0c4", weight: 1, fillOpacity: 0.8 }}>
                  <Tooltip>{c.name}</Tooltip>
                </CircleMarker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Watchtowers — off by default. */}
          <LayersControl.Overlay name={`Watchtowers (${watchtowers.length.toLocaleString()})`}>
            <LayerGroup>
              {watchtowers.map((w) => (
                <Marker key={w.id} position={pt(w.x, w.z)} icon={watchtowerIcon}>
                  <Tooltip>
                    <strong>Watchtower</strong>
                    <br />
                    {w.chunks.toLocaleString()} chunks covered
                  </Tooltip>
                </Marker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      {/* Biome key — click a biome to highlight it on the map. */}
      <div className="mt-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-semibold text-muted-foreground">Biome key</span>
          <span className="text-xs text-muted-foreground">click to highlight</span>
          {selectedBiome !== null && (
            <button type="button" onClick={() => setSelectedBiome(null)} className="text-xs text-primary underline">
              Clear
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px" }}>
          {BIOME_LEGEND.map((b) => {
            const isSel = b.id !== null && b.id === selectedBiome;
            const clickable = b.id !== null;
            return (
              <button
                key={b.name}
                type="button"
                aria-pressed={isSel}
                disabled={!clickable}
                onClick={() => clickable && setSelectedBiome((cur) => (cur === b.id ? null : b.id))}
                title={clickable ? `Highlight ${b.name}` : "Water overlay (not highlightable)"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
                  padding: "2px 6px", borderRadius: 6, cursor: clickable ? "pointer" : "default",
                  background: isSel ? "rgba(245,196,81,0.18)" : "transparent",
                  border: isSel ? "1px solid #d8a93a" : "1px solid transparent",
                  opacity: selectedBiome !== null && !isSel ? 0.5 : 1,
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, border: "1px solid rgba(0,0,0,0.25)", display: "inline-block" }} />
                {b.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
