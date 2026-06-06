import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMapClaims, getMapRegions, getTerritoryCells, getWatchtowers } from "@/lib/queries/map";
import { MapClient } from "@/components/map/MapClient";

export type TerrainOverlay = { url: string; bounds: [[number, number], [number, number]] };

// Read the terrain biome overlay meta (written by scripts/render-terrain.py).
// Returns null when the render hasn't been run yet, so the map still works.
// Bounds use the SAME pt(x,z)=[z,x] convention as WorldMap: [[minZ,minX],[maxZ,maxX]].
async function loadTerrain(): Promise<TerrainOverlay | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public/map/terrain-meta.json"), "utf8");
    const m = JSON.parse(raw) as { minX: number; minZ: number; maxX: number; maxZ: number };
    return { url: "/map/terrain.webp", bounds: [[m.minZ, m.minX], [m.maxZ, m.maxX]] };
  } catch {
    return null;
  }
}

export const revalidate = 300;

export const metadata: Metadata = {
  title: "World Map",
  description: "Interactive BitCraft Online world map — regions, claims, and empire territory.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  const [claims, regions, territory, watchtowers, terrain] = await Promise.all([getMapClaims(), getMapRegions(), getTerritoryCells(), getWatchtowers(), loadTerrain()]);
  return (
    <main className="px-0 py-0">
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">World Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">{regions.length} regions · {claims.length.toLocaleString()} claims · {territory.length.toLocaleString()} controlled chunks · {watchtowers.length.toLocaleString()} watchtowers</p>
        <ul className="sr-only">{regions.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      </div>
      <div className="mx-auto mt-4 max-w-6xl px-6 pb-12">
        <MapClient claims={claims} regions={regions} territory={territory} watchtowers={watchtowers} terrain={terrain} />
      </div>
    </main>
  );
}
