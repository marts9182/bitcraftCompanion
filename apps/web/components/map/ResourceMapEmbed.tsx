import { getMapClaims, getMapRegions, getTerritoryCells, getWatchtowers, getEmpireTerritories } from "@/lib/queries/map";
import { getResourceMapCatalog } from "@/lib/queries/resources";
import { getCreatureMapCatalog } from "@/lib/queries/creatures";
import { MapClient } from "./MapClient";

/**
 * The world map pre-tracking one resource/creature — the detail pages'
 * "Where to find it" embed. terrain/roads stay empty to keep the embed light;
 * `compact` trims the chrome and (critically) disables the URL mirroring the
 * full /map page does, so interacting with the embed never rewrites the host
 * page's URL. Server component.
 */
export async function ResourceMapEmbed({ kind, id }: { kind: "resource" | "creature"; id: number }) {
  const [claims, regions, territory, watchtowers, empires, resourceCatalog, creatureCatalog] = await Promise.all([
    getMapClaims(), getMapRegions(), getTerritoryCells(), getWatchtowers(), getEmpireTerritories(),
    getResourceMapCatalog(), getCreatureMapCatalog(),
  ]);
  return (
    <MapClient
      claims={claims}
      regions={regions}
      territory={territory}
      watchtowers={watchtowers}
      empires={empires}
      terrain={[]}
      roads={[]}
      resourceCatalog={resourceCatalog}
      creatureCatalog={creatureCatalog}
      initialTracked={[{ kind, id }]}
      compact
    />
  );
}
