import { describe, it, expect } from "vitest";
import { watchtowerCentroids } from "./watchtowers";

// chunk_index packs chunk_x one high; chunkIndexToCoord decodes cx = idx%1000 - 1
// (true grid). Chunk center = (cx + 0.5, cz + 0.5).
describe("watchtowerCentroids", () => {
  it("returns one marker per distinct watchtower id at the centroid of its covered chunks", () => {
    // Tower "A": chunkIndex z*1000+{10,12} -> cx {9,11} -> centers (9.5,20.5),(11.5,20.5)
    //   centroid x = 10.5, z = 20.5, chunks = 2
    // Tower "B": chunkIndex z*1000+{30,30,32} -> cx {29,29,31} ->
    //   centers (29.5,40.5),(29.5,42.5),(31.5,40.5)
    //   centroid x = (29.5+29.5+31.5)/3, z = (40.5+42.5+40.5)/3, chunks = 3
    const rows = [
      { chunkIndex: 20 * 1000 + 10, id: "A" },
      { chunkIndex: 20 * 1000 + 12, id: "A" },
      { chunkIndex: 40 * 1000 + 30, id: "B" },
      { chunkIndex: 42 * 1000 + 30, id: "B" },
      { chunkIndex: 40 * 1000 + 32, id: "B" },
    ];

    const out = watchtowerCentroids(rows);
    expect(out).toHaveLength(2);

    const a = out.find((w) => w.id === "A")!;
    expect(a.chunks).toBe(2);
    expect(a.x).toBeCloseTo(10.5, 10);
    expect(a.z).toBeCloseTo(20.5, 10);

    const b = out.find((w) => w.id === "B")!;
    expect(b.chunks).toBe(3);
    expect(b.x).toBeCloseTo((29.5 + 29.5 + 31.5) / 3, 10);
    expect(b.z).toBeCloseTo((40.5 + 42.5 + 40.5) / 3, 10);
  });

  it("coerces numeric ids to strings and returns no markers for empty input", () => {
    expect(watchtowerCentroids([])).toEqual([]);
    const out = watchtowerCentroids([{ chunkIndex: "5005", id: 777 }]); // cx = 5-1 = 4
    expect(out).toEqual([{ id: "777", x: 4.5, z: 5.5, chunks: 1 }]);
  });
});
