#!/usr/bin/env python3
"""Render per-region biome terrain images from the worker's terrain cache.

Run AFTER:  pnpm --filter @bcc/worker terrain-snapshot [--regions=14]
Then:       python scripts/render-terrain.py

Reads apps/worker/.terrain-cache/region-*.bin (+ .json sidecars) — each chunk is a
32x32 tile grid of biome / water-body / elevation — and renders a natural-looking
biome map per region (per-tile biome colour, water bodies + rivers, elevation
hillshade). Writes apps/web/public/map/terrain/region-<N>.webp and a manifest
apps/web/public/map/terrain.json the map overlays.
"""
import json
import os
import glob
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "apps", "worker", ".terrain-cache")
OUT_DIR = os.path.join(ROOT, "apps", "web", "public", "map", "terrain")
MANIFEST = os.path.join(ROOT, "apps", "web", "public", "map", "terrain.json")
TILE = 32  # tiles per chunk side

# Natural, muted biome palette (RGB) tuned toward the in-game minimap look.
BIOME_PALETTE = {
    0: (60, 60, 64),     # Dev
    1: (74, 96, 58),     # Calm Forest
    2: (58, 80, 56),     # Pine Woods
    3: (228, 232, 236),  # Snowy Peaks
    4: (138, 158, 96),   # Breezy Grasslands
    5: (150, 120, 64),   # Autumn Forest
    6: (150, 150, 142),  # Misty Tundra
    7: (178, 154, 102),  # Desert Wasteland
    8: (86, 100, 66),    # Swamp
    9: (140, 132, 116),  # Rocky Garden
    10: (52, 74, 96),    # Open Ocean (biome that reads as ocean)
    11: (158, 176, 110), # Safe Meadows
    12: (70, 64, 74),    # Cave
    13: (60, 110, 72),   # Jungle
    14: (96, 132, 74),   # Sapwoods
}
# Water-body colours by type byte (0 = land, handled separately).
WATER_PALETTE = {
    1: (78, 120, 150),   # river
    2: (78, 120, 150),   # stream
    3: (62, 100, 132),   # lake / shallow
    4: (44, 66, 90),     # ocean
}

# Build LUTs (index 0..255) for fast vectorised lookup.
_biome_lut = np.zeros((256, 3), np.uint8)
for i, c in BIOME_PALETTE.items():
    _biome_lut[i] = c
_water_lut = np.zeros((256, 3), np.float64)
_water_mask_lut = np.zeros(256, bool)
for i, c in WATER_PALETTE.items():
    _water_lut[i] = c
    _water_mask_lut[i] = True


def hillshade(elev, az=315.0, alt=45.0, z_factor=2.2):
    """Standard hillshade in [0,1] from an elevation grid."""
    dy, dx = np.gradient(elev.astype(np.float64))
    slope = np.pi / 2.0 - np.arctan(np.hypot(dx, dy) * z_factor / TILE)
    aspect = np.arctan2(-dx, dy)
    az_r, alt_r = np.radians(az), np.radians(alt)
    sh = np.sin(alt_r) * np.sin(slope) + np.cos(alt_r) * np.cos(slope) * np.cos(az_r - aspect)
    return np.clip(sh, 0.0, 1.0)


REC = np.dtype([("cx", "<i4"), ("cz", "<i4"), ("biome", "u1", TILE * TILE),
                ("water", "u1", TILE * TILE), ("elev", "<i2", TILE * TILE)])


def render_region(meta):
    n = meta["region"]
    min_cx, min_cz = meta["minChunkX"], meta["minChunkZ"]
    max_cx, max_cz = meta["maxChunkX"], meta["maxChunkZ"]
    W = (max_cx - min_cx + 1) * TILE
    H = (max_cz - min_cz + 1) * TILE
    data = np.fromfile(os.path.join(CACHE, f"region-{n}.bin"), dtype=REC)

    biome = np.zeros((H, W), np.uint8)
    water = np.zeros((H, W), np.uint8)
    elev = np.zeros((H, W), np.int16)
    have = np.zeros((H, W), bool)
    for rec in data:
        r = (int(rec["cz"]) - min_cz) * TILE
        c = (int(rec["cx"]) - min_cx) * TILE
        biome[r:r + TILE, c:c + TILE] = rec["biome"].reshape(TILE, TILE)
        water[r:r + TILE, c:c + TILE] = rec["water"].reshape(TILE, TILE)
        elev[r:r + TILE, c:c + TILE] = rec["elev"].reshape(TILE, TILE)
        have[r:r + TILE, c:c + TILE] = True

    # Base biome colour, hillshaded for land relief.
    rgb = _biome_lut[biome].astype(np.float64)
    shade = (0.55 + 0.75 * hillshade(elev))[..., None]  # 0.55..1.30
    rgb = rgb * shade

    # Water bodies override the biome colour (kept flat, only faintly shaded).
    wmask = _water_mask_lut[water]
    wcol = _water_lut[water] * (0.85 + 0.15 * hillshade(elev))[..., None]
    rgb = np.where(wmask[..., None], wcol, rgb)

    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    # Transparent where no data so the dark map shows through outside the landmass.
    alpha = np.where(have, 255, 0).astype(np.uint8)
    # Flip vertically: the binary is row-major in +z (south), but the Leaflet
    # overlay places the image top at the NORTH (max z) edge of its bounds, so the
    # image must be north-up to stay aligned with the vector layers.
    stacked = np.flipud(np.dstack([rgb, alpha]))
    img = Image.fromarray(stacked, "RGBA")

    os.makedirs(OUT_DIR, exist_ok=True)
    img.save(os.path.join(OUT_DIR, f"region-{n}.webp"), lossless=False, quality=88, method=6)
    return {
        "region": n,
        "url": f"/map/terrain/region-{n}.webp",
        "minX": min_cx, "minZ": min_cz, "maxX": max_cx + 1, "maxZ": max_cz + 1,
        "width": W, "height": H,
    }


def main():
    metas = sorted(glob.glob(os.path.join(CACHE, "region-*.json")))
    if not metas:
        raise SystemExit(f"No region-*.json in {CACHE}. Run the terrain-snapshot first.")
    manifest = []
    for p in metas:
        with open(p, encoding="utf-8-sig") as f:
            meta = json.load(f)
        entry = render_region(meta)
        manifest.append(entry)
        print(f"region {entry['region']}: {entry['width']}x{entry['height']}px -> {entry['url']}")
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f)
    print(f"wrote manifest with {len(manifest)} region(s) -> {MANIFEST}")


if __name__ == "__main__":
    main()
