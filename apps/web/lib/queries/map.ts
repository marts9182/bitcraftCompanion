import "server-only";
import { getDb, schema } from "@/lib/db";
import { smallHexToChunk, regionBounds, chunkIndexToBounds } from "@bcc/shared";

export interface ClaimPoint { id: string; name: string; x: number; z: number; tiles: number; treasury: number; }
export interface RegionRect { id: number; name: string | null; x0: number; z0: number; x1: number; z1: number; }
export interface TerritoryCell { x0: number; z0: number; empire: string; }

export async function getMapClaims(): Promise<ClaimPoint[]> {
  const rows = await getDb().select().from(schema.mapClaims);
  return rows.map((c) => {
    const p = smallHexToChunk(c.x, c.z);
    return { id: c.entityId, name: c.name, x: p.x, z: p.z, tiles: c.numTiles, treasury: Number(c.treasury) };
  });
}

export async function getMapRegions(): Promise<RegionRect[]> {
  const rows = await getDb().select().from(schema.mapRegions);
  return rows.map((g) => {
    const b = regionBounds({ minChunkX: g.minChunkX, minChunkZ: g.minChunkZ, widthChunks: g.widthChunks, heightChunks: g.heightChunks });
    return { id: g.id, name: g.name, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
  });
}

export async function getTerritoryCells(): Promise<TerritoryCell[]> {
  const rows = await getDb().select().from(schema.mapChunks);
  return rows.map((c) => {
    const b = chunkIndexToBounds(c.chunkIndex);
    return { x0: b.x0, z0: b.z0, empire: c.empireEntityId };
  });
}
