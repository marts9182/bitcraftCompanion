export interface Downsampled {
  xz: number[];
  sampled: boolean;
}

/**
 * Grid-bucket a flat [x,z,x,z,…] small-hex array down to at most ~cap points,
 * keeping one representative per occupied grid cell so the spatial distribution
 * is preserved (far better than uniform stride). Returns the input unchanged
 * (sampled=false) when it already has cap or fewer points. The grid is g×g with
 * g=floor(sqrt(cap)), so the result is at most g*g ≤ cap points.
 */
export function gridBucketDownsample(xz: number[], cap: number): Downsampled {
  const n = Math.floor(xz.length / 2);
  if (n === 0 || n <= cap) return { xz, sampled: false };

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < xz.length; i += 2) {
    const x = xz[i]!, z = xz[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const g = Math.max(1, Math.floor(Math.sqrt(cap)));
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < xz.length; i += 2) {
    const x = xz[i]!, z = xz[i + 1]!;
    const gx = Math.min(g - 1, Math.floor(((x - minX) / spanX) * g));
    const gz = Math.min(g - 1, Math.floor(((z - minZ) / spanZ) * g));
    const cell = gx * g + gz;
    if (seen.has(cell)) continue;
    seen.add(cell);
    out.push(x, z);
  }
  return { xz: out, sampled: true };
}
