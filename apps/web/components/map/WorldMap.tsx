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

// Biome key — colours MUST match scripts/render-terrain.py BIOME_PALETTE / WATER_PALETTE.
const BIOME_LEGEND: { name: string; color: string }[] = [
  { name: "Calm Forest", color: "#4a603a" },
  { name: "Pine Woods", color: "#3a5038" },
  { name: "Sapwoods", color: "#60844a" },
  { name: "Jungle", color: "#3c6e48" },
  { name: "Swamp", color: "#566442" },
  { name: "Safe Meadows", color: "#9eb06e" },
  { name: "Breezy Grasslands", color: "#8a9e60" },
  { name: "Autumn Forest", color: "#967840" },
  { name: "Desert Wasteland", color: "#b29a66" },
  { name: "Rocky Garden", color: "#8c8474" },
  { name: "Misty Tundra", color: "#96968e" },
  { name: "Snowy Peaks", color: "#e4e8ec" },
  { name: "Cave", color: "#46404a" },
  { name: "Rivers & lakes", color: "#4e7896" },
  { name: "Open Ocean", color: "#344a60" },
];

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
        <label htmlFor="region-focus" style={{ color: "var(--muted-foreground, #666)" }}>Focus region</label>
        <select
          id="region-focus"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", fontSize: 14, minWidth: 180 }}
        >
          <option value="">All regions</option>
          {sorted.map((r) => <option key={r.id} value={r.id}>{regionLabel(r)}</option>)}
        </select>
        {selectedId !== null && (
          <button type="button" onClick={() => setSelectedId(null)} style={{ cursor: "pointer", background: "transparent", border: "none", color: "#a07f25", textDecoration: "underline", fontSize: 13 }}>
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
        style={{ height: "78vh", background: "#1D1B22", borderRadius: "0.5rem" }}
      >
        <FlyToRegion region={selected} worldBounds={worldBounds} />

        {/* Biome terrain base (per-region images) — always-on bottom layer. */}
        {terrain.map((t) => <ImageOverlay key={t.region} url={t.url} bounds={t.bounds} />)}

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

      {/* Biome key — what each terrain colour means. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--muted-foreground, #555)" }}>Biome key</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
          {BIOME_LEGEND.map((b) => (
            <span key={b.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, border: "1px solid rgba(0,0,0,0.25)", display: "inline-block" }} />
              {b.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
