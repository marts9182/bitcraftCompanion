"use client";
import dynamic from "next/dynamic";
import type { ClaimPoint, RegionRect, TerritoryCell, Watchtower, EmpireTerritory } from "@/lib/queries/map";
import type { TerrainOverlay } from "@/app/map/page";
import type { FinderResource, FinderCreature, TrackedRef } from "./MapFinderPanel";

// Leaflet touches `window` at import time, so the map must never render on the
// server. `ssr: false` is only permitted inside a Client Component in Next 16,
// hence this thin "use client" boundary that the server page renders.
const WorldMap = dynamic(() => import("./WorldMap").then((m) => m.WorldMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] min-h-[420px] items-center justify-center rounded-lg bg-card text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function MapClient(props: {
  claims: ClaimPoint[]; regions: RegionRect[]; territory: TerritoryCell[]; watchtowers: Watchtower[]; empires: EmpireTerritory[]; terrain: TerrainOverlay[];
  resourceCatalog: FinderResource[]; creatureCatalog: FinderCreature[]; initialTracked?: TrackedRef[];
}) {
  return <WorldMap {...props} />;
}
