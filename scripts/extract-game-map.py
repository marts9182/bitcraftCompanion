#!/usr/bin/env python3
"""
Extract the BitCraft world/region base map image from the local game install.

Scans the Addressables bundles for Texture2D objects whose container path looks
like a world/region map, prints the candidates (path + dimensions), and exports
the largest match as an optimized .webp under apps/web/public/map/.

Like extract-game-icons.py, this needs the game installed locally and CANNOT run
in CI, so the generated image IS committed. Re-run after a patch that adds regions.

Requirements: Python + UnityPy + Pillow  (pip install UnityPy)
Usage:        python scripts/extract-game-map.py
"""
import os, glob
import UnityPy

GAME_BUNDLE_DIR = r"D:\SteamLibrary\steamapps\common\BitCraft Online\BitCraft_Data\StreamingAssets\aa\StandaloneWindows64"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "apps", "web", "public", "map")

# Container-path keywords that suggest a world/region map texture.
KEYWORDS = ("map", "world", "region", "minimap", "terrain", "overworld", "atlas")
# Exclude obvious non-map textures that happen to contain a keyword.
EXCLUDE = ("icon", "ui/", "button", "cursor", "normalmap", "_n", "roughness", "mask")
MIN_PX = 512  # a world map is large; skip tiny textures


def candidates():
    found = []
    for bundle in glob.glob(os.path.join(GAME_BUNDLE_DIR, "*.bundle")):
        try:
            env = UnityPy.load(bundle)
        except Exception as e:
            print("  (skip", os.path.basename(bundle), "-", e, ")")
            continue
        for path, obj in env.container.items():
            if obj.type.name != "Texture2D":
                continue
            pl = path.lower()
            if not any(k in pl for k in KEYWORDS):
                continue
            if any(x in pl for x in EXCLUDE):
                continue
            try:
                data = obj.read()
                w, h = data.m_Width, data.m_Height
            except Exception:
                continue
            if max(w, h) < MIN_PX:
                continue
            found.append((w * h, w, h, path, os.path.basename(bundle), data))
    found.sort(reverse=True, key=lambda t: t[0])
    return found


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("scanning bundles for world/region map textures…")
    found = candidates()
    if not found:
        print("\nNo world-map texture found. BitCraft likely renders terrain from chunks")
        print("rather than a single map image. FALLBACK: the /map page uses a plain")
        print("background; the data layers (regions, claims, territory) still render.")
        return
    print(f"\n{len(found)} candidate(s):")
    for area, w, h, path, bundle, _ in found[:15]:
        print(f"  {w:>5}x{h:<5}  {path}   [{bundle}]")
    area, w, h, path, bundle, data = found[0]
    img = data.image  # PIL image
    out = os.path.join(OUT_DIR, "world.webp")
    img.save(out, "WEBP", quality=82, method=6)
    print(f"\nEXPORTED largest candidate -> {out}  ({w}x{h})")
    print("Confirm this is the world map; if it's the wrong texture, adjust KEYWORDS/EXCLUDE.")


if __name__ == "__main__":
    main()
