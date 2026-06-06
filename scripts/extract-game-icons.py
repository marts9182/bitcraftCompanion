#!/usr/bin/env python3
"""
Extract BitCraft entity icons from the local game install into the web app.

What it does
------------
Reads the game's Addressables icon bundle, exports each `GeneratedIcons/...`
sprite as an optimized .webp under `apps/web/public/icons/`, and writes
`apps/web/lib/icon-manifest.json` (the set of available icon keys, so the web
app only renders <img> for icons that exist — the rest fall back to a monogram).

Requirements
------------
- The game installed locally (BitCraft Online via Steam).
- Python + UnityPy + Pillow:  `pip install UnityPy`
- Re-run after a game patch to refresh icons. CANNOT run in CI (needs the game
  files), so the generated `public/icons/` and `icon-manifest.json` ARE committed.

Config: set BUNDLE to the gameicon-data Addressables bundle. The relevant bundle
is `remoteassets_assets__*.bundle` (it contains 5k+ Sprite objects with
`.../Sprites/GeneratedIcons/<Category>/<Name>.png` container paths). The hash in
the filename changes between patches — find the bundle with the most
`GeneratedIcons` container entries if this path is stale.

Usage:  python scripts/extract-game-icons.py
"""
import json, os, glob
import UnityPy

GAME_BUNDLE_DIR = r"D:\SteamLibrary\steamapps\common\BitCraft Online\BitCraft_Data\StreamingAssets\aa\StandaloneWindows64"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "apps", "web", "public", "icons")
MANIFEST = os.path.join(REPO_ROOT, "apps", "web", "lib", "icon-manifest.json")
MAX_PX = 128


def pick_bundle() -> str:
    """Choose the local bundle with the most current GeneratedIcons sprites."""
    best, best_n = None, -1
    for p in glob.glob(os.path.join(GAME_BUNDLE_DIR, "*.bundle")):
        try:
            env = UnityPy.load(p)
            n = sum(
                1
                for path, _ in env.container.items()
                if "GeneratedIcons/" in path and "OldGeneratedIcons" not in path
            )
        except Exception:
            n = 0
        if n > best_n:
            best, best_n = p, n
    return best


def main() -> None:
    bundle = pick_bundle()
    print("bundle:", bundle)
    env = UnityPy.load(bundle)
    seen: set[str] = set()
    count = errors = total = 0
    for path, obj in env.container.items():
        if obj.type.name != "Sprite":
            continue
        i = path.find("GeneratedIcons/")
        if i < 0 or "OldGeneratedIcons" in path:
            continue
        rel = path[i:]
        if rel.lower().endswith(".png"):
            rel = rel[:-4]
        if rel in seen:
            continue
        seen.add(rel)
        try:
            img = obj.read().image
            if img is None:
                errors += 1
                continue
            if img.mode not in ("RGBA", "RGB"):
                img = img.convert("RGBA")
            img.thumbnail((MAX_PX, MAX_PX))
            dest = os.path.join(OUT_DIR, *rel.split("/")) + ".webp"
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            img.save(dest, "WEBP", quality=80, method=4)
            total += os.path.getsize(dest)
            count += 1
        except Exception as e:
            errors += 1
            if errors <= 5:
                print("  err", rel, e)
    with open(MANIFEST, "w", encoding="utf-8", newline="") as f:
        json.dump(sorted(seen), f)
    print(f"extracted={count} errors={errors} totalMB={total / 1048576:.1f} manifest={len(seen)}")


if __name__ == "__main__":
    main()
