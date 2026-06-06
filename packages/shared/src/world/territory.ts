// Trace the outline of each empire's territory from its set of owned chunks.
// A chunk (x,z) occupies the unit square [x,x+1]×[z,z+1]. An edge of that square
// is on the empire's BORDER when the neighbouring chunk across it is owned by a
// different empire (or unowned). Collecting those edges per empire yields a crisp
// territory outline (drawn as a multi-polyline on the map) without filling every
// chunk. Also returns the territory centroid (for a name label) and chunk count.

export interface TerritoryCellInput {
  x: number;
  z: number;
  empire: string;
}

export type Segment = [[number, number], [number, number]];

export interface EmpireOutline {
  empire: string;
  segments: Segment[];
  centroidX: number;
  centroidZ: number;
  chunks: number;
}

export function empireTerritoryOutlines(cells: TerritoryCellInput[]): EmpireOutline[] {
  const owner = new Map<string, string>();
  for (const c of cells) owner.set(`${c.x},${c.z}`, c.empire);

  const acc = new Map<string, { segments: Segment[]; sx: number; sz: number; n: number }>();
  for (const c of cells) {
    let a = acc.get(c.empire);
    if (!a) {
      a = { segments: [], sx: 0, sz: 0, n: 0 };
      acc.set(c.empire, a);
    }
    a.sx += c.x;
    a.sz += c.z;
    a.n += 1;
    const { x, z, empire } = c;
    if (owner.get(`${x - 1},${z}`) !== empire) a.segments.push([[x, z], [x, z + 1]]); // left
    if (owner.get(`${x + 1},${z}`) !== empire) a.segments.push([[x + 1, z], [x + 1, z + 1]]); // right
    if (owner.get(`${x},${z - 1}`) !== empire) a.segments.push([[x, z], [x + 1, z]]); // bottom
    if (owner.get(`${x},${z + 1}`) !== empire) a.segments.push([[x, z + 1], [x + 1, z + 1]]); // top
  }

  return [...acc.entries()].map(([empire, a]) => ({
    empire,
    segments: a.segments,
    centroidX: a.sx / a.n,
    centroidZ: a.sz / a.n,
    chunks: a.n,
  }));
}
