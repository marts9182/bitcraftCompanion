import type { Metadata } from "next";
import { getMapClaims, getMapRegions, getTerritoryCells } from "@/lib/queries/map";
import { MapClient } from "@/components/map/MapClient";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "World Map",
  description: "Interactive BitCraft Online world map — regions, claims, and empire territory.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  const [claims, regions, territory] = await Promise.all([getMapClaims(), getMapRegions(), getTerritoryCells()]);
  return (
    <main className="px-0 py-0">
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">World Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">{regions.length} regions · {claims.length.toLocaleString()} claims · {territory.length.toLocaleString()} controlled chunks</p>
        <ul className="sr-only">{regions.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      </div>
      <div className="mx-auto mt-4 max-w-6xl px-6 pb-12">
        <MapClient claims={claims} regions={regions} territory={territory} />
      </div>
    </main>
  );
}
