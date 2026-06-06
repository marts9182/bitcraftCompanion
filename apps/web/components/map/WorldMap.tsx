"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, LayersControl, LayerGroup, CircleMarker, Marker, Rectangle, Popup, Tooltip, useMap } from "react-leaflet";
import { CRS, Icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ClaimPoint, RegionRect, TerritoryCell, Watchtower } from "@/lib/queries/map";

// CHUNK coordinates. CRS.Simple uses [y,x]; map game (x,z) -> [z, x].
const pt = (x: number, z: number): [number, number] => [z, x];

const watchtowerIcon = new Icon({ iconUrl: "/map/watchtower.webp", iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] });

export const regionLabel = (r: RegionRect): string => r.name ?? `Region ${r.id}`;
export const sortRegions = (regions: RegionRect[]): RegionRect[] =>
  [...regions].sort((a, b) => regionLabel(a).localeCompare(regionLabel(b)));

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

export function WorldMap({ claims, regions, territory, watchtowers }: {
  claims: ClaimPoint[]; regions: RegionRect[]; territory: TerritoryCell[]; watchtowers: Watchtower[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Fit bounds to the region extent (chunk coords). Fallback to a default if empty.
  const xs = regions.flatMap((r) => [r.x0, r.x1]);
  const zs = regions.flatMap((r) => [r.z0, r.z1]);
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1000;
  const minZ = zs.length ? Math.min(...zs) : 0, maxZ = zs.length ? Math.max(...zs) : 1000;
  // Memoized so it's stable across renders — FlyToRegion's effect deps on it and
  // an unmemoized array would re-fire (yank the camera) on any future re-render.
  const worldBounds = useMemo<[[number, number], [number, number]]>(
    () => [pt(minX, minZ), pt(maxX, maxZ)],
    [minX, minZ, maxX, maxZ],
  );

  const sorted = sortRegions(regions);
  const selected = regions.find((r) => r.id === selectedId) ?? null;

  return (
    <div style={{ position: "relative" }}>
      <MapContainer
        crs={CRS.Simple}
        bounds={worldBounds}
        preferCanvas
        minZoom={-3}
        maxZoom={5}
        style={{ height: "78vh", background: "#1D1B22", borderRadius: "0.5rem" }}
      >
        <FlyToRegion region={selected} worldBounds={worldBounds} />
        <LayersControl position="topright">
          <LayersControl.Overlay name={`Empire territory (${territory.length.toLocaleString()})`}>
            <LayerGroup>
              {territory.map((c, i) => (
                <Rectangle key={i} bounds={[pt(c.x0, c.z0), pt(c.x0 + 1, c.z0 + 1)]} pathOptions={{ stroke: false, fillColor: c.color, fillOpacity: 0.55 }} />
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name="Regions" checked>
            <LayerGroup>
              {regions.map((r) => {
                const isSel = r.id === selectedId;
                return (
                  <Rectangle
                    key={r.id}
                    bounds={[pt(r.x0, r.z0), pt(r.x1, r.z1)]}
                    pathOptions={isSel
                      ? { color: "#F5C451", weight: 3, fill: true, fillColor: "#F5C451", fillOpacity: 0.08 }
                      : { color: "#E9DFC4", weight: 1, fill: false }}
                  >
                    {r.name && <Tooltip permanent direction="center">{r.name}</Tooltip>}
                  </Rectangle>
                );
              })}
            </LayerGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name={`Claims (${claims.length.toLocaleString()})`} checked>
            <LayerGroup>
              {claims.map((c) => (
                <CircleMarker key={c.id} center={pt(c.x, c.z)} radius={3} pathOptions={{ color: "#D5BB72", weight: 1, fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>{c.name}</strong>
                    <br />
                    {c.tiles} tiles · treasury {c.treasury.toLocaleString()}
                  </Popup>
                </CircleMarker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name={`Watchtowers (${watchtowers.length.toLocaleString()})`} checked>
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

      <RegionLegend regions={sorted} selectedId={selectedId} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} onClear={() => setSelectedId(null)} />
    </div>
  );
}

function RegionLegend({ regions, selectedId, onSelect, onClear }: {
  regions: RegionRect[]; selectedId: number | null; onSelect: (id: number) => void; onClear: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute", top: 12, left: 12, zIndex: 1000, pointerEvents: "auto",
        width: 180, maxHeight: "calc(78vh - 24px)", display: "flex", flexDirection: "column",
        background: "rgba(29, 27, 34, 0.88)", color: "#E9DFC4",
        border: "1px solid rgba(213, 187, 114, 0.4)", borderRadius: "0.5rem",
        padding: "0.5rem 0.5rem 0.4rem", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingLeft: 2 }}>
        <span style={{ fontWeight: 600, letterSpacing: "0.02em", color: "#F5C451" }}>Regions</span>
        {selectedId !== null && (
          <button
            type="button"
            onClick={onClear}
            style={{ cursor: "pointer", background: "transparent", border: "none", color: "#D5BB72", fontSize: 11, padding: "0 2px", textDecoration: "underline" }}
          >
            Show all
          </button>
        )}
      </div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {regions.map((r) => {
          const isSel = r.id === selectedId;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={isSel}
              onClick={() => onSelect(r.id)}
              style={{
                cursor: "pointer", textAlign: "left", width: "100%",
                padding: "3px 6px", borderRadius: "0.3rem", fontSize: 12,
                background: isSel ? "rgba(245, 196, 81, 0.18)" : "transparent",
                border: isSel ? "1px solid #F5C451" : "1px solid transparent",
                color: isSel ? "#F5C451" : "#E9DFC4",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {regionLabel(r)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
