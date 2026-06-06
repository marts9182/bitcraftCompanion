#!/usr/bin/env python3
"""
Render the BitCraft biome terrain base image (the "bccodex look").

Reads the compact intermediate written by the worker terrain snapshot and paints
one pixel per chunk, coloured by that chunk's dominant biome, into an RGBA webp.
Chunks with no data (or biome -1) stay transparent so the Leaflet base under it
shows through.

PIPELINE (run in order, from the repo root):
  1. pnpm --filter @bcc/worker terrain-snapshot      # multi-GB pull; writes the intermediate
  2. python scripts/render-terrain.py                # this script; writes terrain.webp + meta

Inputs:  apps/worker/.terrain-cache/terrain-biomes.json   (gitignored, regenerable)
Outputs: apps/web/public/map/terrain.webp                 (committed by the controller after render)
         apps/web/public/map/terrain-meta.json            (overlay bounds for the web layer)

ORIENTATION NOTE: pixel (0,0) is at (minX, minZ) — i.e. row index = z - minZ, with
z increasing DOWNWARD in the image. The web layer uses Leaflet CRS.Simple with
pt(x,z) = [z, x] and bounds [[minZ,minX],[maxZ,maxX]]. If the controller sees the
terrain mirrored vertically vs. the region rectangles, flip the image here by
setting FLIP_Z = True (the rendered rows are reversed) rather than touching the
web bounds. Leave the bounds in the web layer untouched.

Requirements: Python 3 + Pillow  (from PIL import Image)
Usage:        python scripts/render-terrain.py
"""
import json
import os
from collections import Counter

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN_FILE = os.path.join(REPO_ROOT, "apps", "worker", ".terrain-cache", "terrain-biomes.json")
OUT_DIR = os.path.join(REPO_ROOT, "apps", "web", "public", "map")
OUT_IMG = os.path.join(OUT_DIR, "terrain.webp")
OUT_META = os.path.join(OUT_DIR, "terrain-meta.json")

# Set True if the rendered terrain appears vertically mirrored vs. the region
# rectangles in the Leaflet map (see ORIENTATION NOTE above).
FLIP_Z = False

# biome_type id -> RGB. Starting bccodex-style palette; tune freely. -1/unknown
# is left transparent (never written).
BIOME_PALETTE: dict[int, tuple[int, int, int]] = {
    0: (20, 20, 24),     # Dev
    1: (74, 124, 58),    # Calm Forest
    2: (47, 93, 58),     # Pine Woods
    3: (232, 238, 242),  # Snowy Peaks
    4: (143, 191, 90),   # Breezy Grasslands
    5: (200, 119, 46),   # Autumn Forest
    6: (159, 176, 168),  # Misty Tundra
    7: (217, 193, 121),  # Desert Wasteland
    8: (92, 107, 58),    # Swamp
    9: (155, 139, 110),  # Rocky Garden
    10: (30, 90, 134),   # Open Ocean
    11: (169, 211, 107), # Safe Meadows
    12: (58, 51, 64),    # Cave
    13: (47, 125, 79),   # Jungle
    14: (107, 155, 74),  # Sapwoods
}

BIOME_NAMES: dict[int, str] = {
    0: "Dev", 1: "Calm Forest", 2: "Pine Woods", 3: "Snowy Peaks", 4: "Breezy Grasslands",
    5: "Autumn Forest", 6: "Misty Tundra", 7: "Desert Wasteland", 8: "Swamp", 9: "Rocky Garden",
    10: "Open Ocean", 11: "Safe Meadows", 12: "Cave", 13: "Jungle", 14: "Sapwoods", -1: "(none)",
}


def main() -> None:
    if not os.path.exists(IN_FILE):
        raise SystemExit(
            f"Intermediate not found: {IN_FILE}\n"
            "Run `pnpm --filter @bcc/worker terrain-snapshot` first."
        )
    with open(IN_FILE, "r", encoding="utf-8-sig") as f:  # utf-8-sig tolerates a stray BOM
        data = json.load(f)

    min_x, min_z = data["minX"], data["minZ"]
    max_x, max_z = data["maxX"], data["maxZ"]
    chunks = data["chunks"]

    width = max_x - min_x + 1
    height = max_z - min_z + 1
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = img.load()

    histogram: Counter[int] = Counter()
    painted = 0
    for x, z, biome in chunks:
        histogram[biome] += 1
        color = BIOME_PALETTE.get(biome)
        if color is None:  # -1 / unknown -> transparent
            continue
        py = (max_z - z) if FLIP_Z else (z - min_z)
        px[x - min_x, py] = (color[0], color[1], color[2], 255)
        painted += 1

    os.makedirs(OUT_DIR, exist_ok=True)
    # Biome flats are large solid runs -> lossless webp is crisp and tiny.
    img.save(OUT_IMG, format="WEBP", lossless=True, method=6)

    meta = {"minX": min_x, "minZ": min_z, "maxX": max_x, "maxZ": max_z, "width": width, "height": height}
    with open(OUT_META, "w", encoding="utf-8") as f:
        json.dump(meta, f)

    file_kb = os.path.getsize(OUT_IMG) / 1024
    print(f"terrain.webp: {width}x{height}px, {painted}/{len(chunks)} chunks painted, {file_kb:.1f} KiB")
    print(f"bounds: x[{min_x}..{max_x}] z[{min_z}..{max_z}]  (FLIP_Z={FLIP_Z})")
    print("biome histogram:")
    for biome, count in histogram.most_common():
        print(f"  {biome:>3} {BIOME_NAMES.get(biome, '?'):<18} {count}")
    print(f"wrote {OUT_IMG}")
    print(f"wrote {OUT_META}")


if __name__ == "__main__":
    main()
