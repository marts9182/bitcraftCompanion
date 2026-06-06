"use client";
import { MapContainer, LayersControl, LayerGroup, CircleMarker, Marker, Rectangle, Popup, Tooltip } from "react-leaflet";
import { CRS, Icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ClaimPoint, RegionRect, TerritoryCell, Watchtower } from "@/lib/queries/map";

// CHUNK coordinates. CRS.Simple uses [y,x]; map game (x,z) -> [z, x].
const pt = (x: number, z: number): [number, number] => [z, x];

const watchtowerIcon = new Icon({ iconUrl: "/map/watchtower.webp", iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] });

export function WorldMap({ claims, regions, territory, watchtowers }: {
  claims: ClaimPoint[]; regions: RegionRect[]; territory: TerritoryCell[]; watchtowers: Watchtower[];
}) {
  // Fit bounds to the region extent (chunk coords). Fallback to a default if empty.
  const xs = regions.flatMap((r) => [r.x0, r.x1]);
  const zs = regions.flatMap((r) => [r.z0, r.z1]);
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1000;
  const minZ = zs.length ? Math.min(...zs) : 0, maxZ = zs.length ? Math.max(...zs) : 1000;
  const worldBounds: [[number, number], [number, number]] = [pt(minX, minZ), pt(maxX, maxZ)];

  return (
    <MapContainer
      crs={CRS.Simple}
      bounds={worldBounds}
      preferCanvas
      minZoom={-3}
      maxZoom={5}
      style={{ height: "78vh", background: "#1D1B22", borderRadius: "0.5rem" }}
    >
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
            {regions.map((r) => (
              <Rectangle key={r.id} bounds={[pt(r.x0, r.z0), pt(r.x1, r.z1)]} pathOptions={{ color: "#E9DFC4", weight: 1, fill: false }}>
                {r.name && <Tooltip permanent direction="center">{r.name}</Tooltip>}
              </Rectangle>
            ))}
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
              <Marker key={w.id} position={pt(w.x, w.z)} icon={watchtowerIcon} />
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
      </LayersControl>
    </MapContainer>
  );
}
