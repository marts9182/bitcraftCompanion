// Rasterize paved-tile positions into a transparent PNG overlay per region,
// north-up to match the terrain overlays (row 0 = max Z, same as render-terrain.py).
import { PNG } from "pngjs";

export const SMALLHEX_PER_PX = 8; // 12 px per chunk — crisp enough for roads, small files

const ROAD_RGBA: [number, number, number, number] = [232, 222, 196, 235]; // parchment, near-opaque

export interface RoadRaster {
  rgba: Uint8Array; width: number; height: number;
  minChunkX: number; minChunkZ: number; maxChunkX: number; maxChunkZ: number;
}

export function rasterizeRoads(xz: number[]): RoadRaster | null {
  if (xz.length < 2) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < xz.length; i += 2) {
    if (xz[i]! < minX) minX = xz[i]!;
    if (xz[i]! > maxX) maxX = xz[i]!;
    if (xz[i + 1]! < minZ) minZ = xz[i + 1]!;
    if (xz[i + 1]! > maxZ) maxZ = xz[i + 1]!;
  }
  const minChunkX = Math.floor(minX / 96), minChunkZ = Math.floor(minZ / 96);
  const maxChunkX = Math.floor(maxX / 96) + 1, maxChunkZ = Math.floor(maxZ / 96) + 1;
  const width = Math.ceil(((maxChunkX - minChunkX) * 96) / SMALLHEX_PER_PX);
  const height = Math.ceil(((maxChunkZ - minChunkZ) * 96) / SMALLHEX_PER_PX);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < xz.length; i += 2) {
    const px = Math.floor((xz[i]! - minChunkX * 96) / SMALLHEX_PER_PX);
    const pz = Math.floor((xz[i + 1]! - minChunkZ * 96) / SMALLHEX_PER_PX);
    const row = height - 1 - pz; // north-up
    if (px < 0 || px >= width || row < 0 || row >= height) continue;
    const o = (row * width + px) * 4;
    rgba[o] = ROAD_RGBA[0]; rgba[o + 1] = ROAD_RGBA[1]; rgba[o + 2] = ROAD_RGBA[2]; rgba[o + 3] = ROAD_RGBA[3];
  }
  return { rgba, width, height, minChunkX, minChunkZ, maxChunkX, maxChunkZ };
}

export function encodePng(r: RoadRaster): Buffer {
  const png = new PNG({ width: r.width, height: r.height });
  Buffer.from(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength).copy(png.data);
  return PNG.sync.write(png);
}
