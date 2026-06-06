import { describe, it, expect } from "vitest";
import { watchtowerCentroids } from "./watchtowers";

// chunk_index = chunk_z * 1000 + chunk_x; chunk center = (cx + 0.5, cz + 0.5).
describe("watchtowerCentroids", () => {
  it("returns one marker per distinct watchtower id at the centroid of its covered chunks", () => {
    // Tower "A": chunks (cx,cz) = (10,20) and (12,20) -> centers (10.5,20.5),(12.5,20.5)
    //   centroid x = 11.5, z = 20.5, chunks = 2
    // Tower "B": chunks (cx,cz) = (30,40),(30,42),(32,40) ->
    //   centers (30.5,40.5),(30.5,42.5),(32.5,40.5)
    //   centroid x = (30.5+30.5+32.5)/3 = 31.166..., z = (40.5+42.5+40.5)/3 = 41.166..., chunks = 3
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
    expect(a.x).toBeCloseTo(11.5, 10);
    expect(a.z).toBeCloseTo(20.5, 10);

    const b = out.find((w) => w.id === "B")!;
    expect(b.chunks).toBe(3);
    expect(b.x).toBeCloseTo((30.5 + 30.5 + 32.5) / 3, 10);
    expect(b.z).toBeCloseTo((40.5 + 42.5 + 40.5) / 3, 10);
  });

  it("coerces numeric ids to strings and returns no markers for empty input", () => {
    expect(watchtowerCentroids([])).toEqual([]);
    const out = watchtowerCentroids([{ chunkIndex: "5005", id: 777 }]);
    expect(out).toEqual([{ id: "777", x: 5.5, z: 5.5, chunks: 1 }]);
  });
});
