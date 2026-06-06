import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMapClaims, getMapRegions, getTerritoryCells, getWatchtowers, getEmpireTerritories } from "@/lib/queries/map";
import { MapClient } from "@/components/map/MapClient";

export type TerrainOverlay = { region: number; url: string; bounds: [[number, number], [number, number]] };

// Read the per-region terrain manifest written by scripts/render-terrain.py.
// Returns [] when the render hasn't been run yet, so the map still works.
// Bounds use the SAME pt(x,z)=[z,x] (north-up) convention as WorldMap.
// TERRAIN_DX/DZ nudge the terrain overlay (in chunk units) to fine-tune its
// alignment against the vector layers (empires/claims). Adjust if they drift.
const TERRAIN_DX = 1;
const TERRAIN_DZ = 0;
async function loadTerrain(): Promise<TerrainOverlay[]> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public/map/terrain.json"), "utf8");
    const list = JSON.parse(raw) as Array<{ region: number; url: string; minX: number; minZ: number; maxX: number; maxZ: number }>;
    return list.map((m) => ({
      region: m.region,
      url: m.url,
      bounds: [[m.minZ + TERRAIN_DZ, m.minX + TERRAIN_DX], [m.maxZ + TERRAIN_DZ, m.maxX + TERRAIN_DX]],
    }));
  } catch {
    return [];
  }
}

export const revalidate = 300;

export const metadata: Metadata = {
  title: "World Map",
  description: "Interactive BitCraft Online world map — biome terrain, regions, empires, claims.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  const [claims, regions, territory, watchtowers, empires, terrain] = await Promise.all([
    getMapClaims(), getMapRegions(), getTerritoryCells(), getWatchtowers(), getEmpireTerritories(), loadTerrain(),
  ]);
  const settlements = claims.filter((c) => c.kind === "settlement").length;
  return (
    <main className="px-0 py-0">
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">World Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">{regions.length} regions · {empires.length.toLocaleString()} empires · {settlements.toLocaleString()} settlements · {territory.length.toLocaleString()} controlled chunks</p>
        <ul className="sr-only">{regions.map((r) => <li key={r.id}>{r.name ?? `Region ${r.id}`}</li>)}</ul>
      </div>
      <div className="mx-auto mt-4 max-w-6xl px-6 pb-12">
        <MapClient claims={claims} regions={regions} territory={territory} watchtowers={watchtowers} empires={empires} terrain={terrain} />
      </div>
    </main>
  );
}
