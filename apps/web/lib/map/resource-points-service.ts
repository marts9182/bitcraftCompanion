import { unstable_cache } from "next/cache";
import { fetchResourcePoints } from "@/lib/spacetime/resource-points";
import { gridBucketDownsample } from "@/lib/map/downsample";

/** Max points returned per (region, resource). Mega-resources are downsampled. */
export const CAP = 5000;

export interface ResourcePoints {
  xz: number[];
  total: number;
  sampled: boolean;
}

/** Pure: record the true point count, then grid-bucket down to <= cap. */
export function packAndDownsample(rawXz: number[], cap = CAP): ResourcePoints {
  const total = Math.floor(rawXz.length / 2);
  const { xz, sampled } = gridBucketDownsample(rawXz, cap);
  return { xz, total, sampled };
}

/**
 * Cached (15 min) per (region, id). On a cache miss, queries the live game and
 * downsamples BEFORE returning, so the cached entry stays small — Next's Data
 * Cache rejects entries over ~2 MB, and a raw mega-resource set is ~50 MB.
 * unstable_cache only stores successful returns, so a failed query is not cached.
 */
export const getResourcePoints = unstable_cache(
  async (region: number, id: number): Promise<ResourcePoints> => {
    const xz = await fetchResourcePoints(region, id);
    return packAndDownsample(xz);
  },
  ["map-resource-points"],
  { revalidate: 900, tags: ["map-resource-points"] },
);
