import "server-only";
import { unstable_cache } from "next/cache";
import { getDb, schema } from "@/lib/db";
import {
  smallHexToChunk, regionBounds, chunkIndexToBounds, watchtowerCentroids,
  vividTerritoryColor, classifyClaim, empireTerritoryOutlines, type ClaimKind,
} from "@bcc/shared";
import type { Watchtower } from "@bcc/shared";
import { eq, isNotNull } from "drizzle-orm";

export interface ClaimPoint { id: string; name: string; kind: ClaimKind; x: number; z: number; tiles: number; treasury: number; }
export interface RegionRect { id: number; name: string | null; x0: number; z0: number; x1: number; z1: number; }
export interface TerritoryCell { x0: number; z0: number; color: string; }
export interface EmpireTerritory { id: string; name: string; color: string; chunks: number; segments: [[number, number], [number, number]][]; labelX: number; labelZ: number; }
export type { Watchtower };

// world_region_name_state carries generic "Region N" labels for unsettled regions,
// and those labels are off-by-one in the live data (region 22 → "Region 21"), which
// produces duplicates. Treat any generic "Region N" as unnamed so the display falls
// back to the canonical region id (map_regions.id = the real region number).
const GENERIC_REGION_NAME = /^Region\s+\d+$/i;

// The small-hex → chunk decode (smallHexToChunk) lands one chunk WEST of the
// empire chunk grid (empire_chunk_state, decoded via chunkIndexToBounds) that the
// terrain is aligned to, so nudge claim positions one chunk east to match.
const CLAIM_DX = 1;

// All map fetchers are unstable_cache'd for 30 min — the worker snapshot cadence.
// The underlying tables only change when a snapshot lands, and these queries are
// hit by every ISR detail page (via the map embed) as well as /map itself.
const MAP_CACHE = { revalidate: 1800 } as const;

export const getMapClaims = unstable_cache(async (): Promise<ClaimPoint[]> => {
  const rows = await getDb().select().from(schema.mapClaims);
  return rows.map((c) => {
    const p = smallHexToChunk(c.x, c.z);
    const { kind, label } = classifyClaim(c.name);
    return { id: c.entityId, name: label, kind, x: p.x + CLAIM_DX, z: p.z, tiles: c.numTiles, treasury: Number(c.treasury) };
  });
}, ["map-claims"], MAP_CACHE);

export const getMapRegions = unstable_cache(async (): Promise<RegionRect[]> => {
  const rows = await getDb().select().from(schema.mapRegions);
  return rows.map((g) => {
    const b = regionBounds({ minChunkX: g.minChunkX, minChunkZ: g.minChunkZ, widthChunks: g.widthChunks, heightChunks: g.heightChunks });
    const name = g.name && !GENERIC_REGION_NAME.test(g.name) ? g.name : null;
    return { id: g.id, name, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
  });
}, ["map-regions"], MAP_CACHE);

export const getTerritoryCells = unstable_cache(async (): Promise<TerritoryCell[]> => {
  const rows = await getDb()
    .select({ chunkIndex: schema.mapChunks.chunkIndex, color: schema.empires.color })
    .from(schema.mapChunks)
    .leftJoin(schema.empires, eq(schema.mapChunks.empireEntityId, schema.empires.entityId));
  return rows.map((row) => {
    const b = chunkIndexToBounds(row.chunkIndex);
    return { x0: b.x0, z0: b.z0, color: row.color ? vividTerritoryColor(row.color) : "#888888" };
  });
}, ["map-territory-cells"], MAP_CACHE);

// Outline each empire's territory (the union of its chunks) as a multi-polyline,
// with a centroid label. Borders + names render as their own toggleable layer.
export const getEmpireTerritories = unstable_cache(async (): Promise<EmpireTerritory[]> => {
  const rows = await getDb()
    .select({ chunkIndex: schema.mapChunks.chunkIndex, empire: schema.mapChunks.empireEntityId, name: schema.empires.name, color: schema.empires.color })
    .from(schema.mapChunks)
    .leftJoin(schema.empires, eq(schema.mapChunks.empireEntityId, schema.empires.entityId));
  const meta = new Map<string, { name: string; color: string }>();
  const cells = rows.map((r) => {
    const b = chunkIndexToBounds(r.chunkIndex);
    if (!meta.has(r.empire)) meta.set(r.empire, { name: r.name ?? "Unaligned", color: r.color ? vividTerritoryColor(r.color) : "#888888" });
    return { x: b.x0, z: b.z0, empire: r.empire };
  });
  return empireTerritoryOutlines(cells).map((o) => {
    const m = meta.get(o.empire)!;
    return { id: o.empire, name: m.name, color: m.color, chunks: o.chunks, segments: o.segments, labelX: o.centroidX + 0.5, labelZ: o.centroidZ + 0.5 };
  });
}, ["map-empire-territories"], MAP_CACHE);

// Every chunk carries the id of the watchtower covering it (~38k chunks, ~555 distinct towers).
// Return ONE marker per distinct watchtower, placed at the centroid of its covered chunks.
export const getWatchtowers = unstable_cache(async (): Promise<Watchtower[]> => {
  const rows = await getDb()
    .select({ chunkIndex: schema.mapChunks.chunkIndex, id: schema.mapChunks.watchtowerEntityId })
    .from(schema.mapChunks)
    .where(isNotNull(schema.mapChunks.watchtowerEntityId));
  // Watchtowers come from the same chunk grid as claims, so they share the
  // one-chunk-east calibration (CLAIM_DX) that aligns the decode to the terrain base.
  return watchtowerCentroids(rows.map((c) => ({ chunkIndex: c.chunkIndex, id: String(c.id) }))).map(
    (w) => ({ ...w, x: w.x + CLAIM_DX }),
  );
}, ["map-watchtowers"], MAP_CACHE);
