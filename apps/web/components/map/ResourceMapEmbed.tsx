import { getMapClaims, getMapRegions } from "@/lib/queries/map";
import { getResourceMapCatalog } from "@/lib/queries/resources";
import { getCreatureMapCatalog } from "@/lib/queries/creatures";
import { MapClient } from "./MapClient";

/**
 * The world map pre-tracking one resource/creature — the detail pages'
 * "Where to find it" embed. terrain/roads stay empty to keep the embed light;
 * `compact` trims the chrome and (critically) disables the URL mirroring the
 * full /map page does, so interacting with the embed never rewrites the host
 * page's URL. Server component.
 *
 * Payload trim: embeds answer "where is it" — spawn dots + regions +
 * settlements are enough. Territory (38k cells), watchtowers and empire
 * outlines are heavy decorative layers (~3.8MB extra serialized props) that
 * stay on the full /map page; pass them empty here.
 */
export async function ResourceMapEmbed({ kind, id }: { kind: "resource" | "creature"; id: number }) {
  const [claims, regions, resourceCatalog, creatureCatalog] = await Promise.all([
    getMapClaims(), getMapRegions(),
    getResourceMapCatalog(), getCreatureMapCatalog(),
  ]);
  return (
    <MapClient
      claims={claims}
      regions={regions}
      territory={[]}
      watchtowers={[]}
      empires={[]}
      terrain={[]}
      roads={[]}
      resourceCatalog={resourceCatalog}
      creatureCatalog={creatureCatalog}
      initialTracked={[{ kind, id }]}
      compact
    />
  );
}
