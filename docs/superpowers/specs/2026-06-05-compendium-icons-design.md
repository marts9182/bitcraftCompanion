# Compendium Icons (infrastructure + graceful fallback)

**Date:** 2026-06-05
**Status:** Approved-by-delegation (owner asked for "real icons" + "follow best practices" while away). Lands on `main`.

## Context & the hard constraint

We store `iconAssetName` strings (e.g. `"GeneratedIcons/Items/AncientGear"`) but NOT the
image files. Investigation (2026-06-05):
- No public CDN/repo serves BitCraft icons keyed by asset name.
- Community sites (BitCraftToolBox/`brico`, `cereal`) render icons from the game's
  **icon font** (`Icons.otf`), extracted from the install via FontForge → SVG → embedded
  font. Their extracted asset dirs are gitignored (not redistributed).
- The game is installed at `D:\SteamLibrary\steamapps\common\BitCraft Online`, but icons
  live inside Unity archives (`resources.assets`, `sharedassets0.assets`, Addressables in
  `StreamingAssets/aa`) — no loose font; extraction needs AssetRipper/AssetStudio + FontForge.

Extracting + hosting game assets is owner-involved work with a licensing decision, so it is
NOT done autonomously here. Instead we build the infrastructure so real icons are a drop-in.

## Goal

A single `EntityIcon` component used everywhere an entity is shown. When a hosted icon set is
configured (`NEXT_PUBLIC_ICON_BASE_URL`), it renders the real image; otherwise a polished,
consistent placeholder (rarity-tinted rounded tile with the entity's monogram). Wiring it once
means real icons light up across the whole compendium by setting one env var later.

## Scope

**In scope:**
- `apps/web/lib/icons.ts` — pure helpers: `iconUrl(assetName)` and `monogram(name)`.
- `apps/web/components/compendium/EntityIcon.tsx` — the icon/placeholder component.
- Wire into list rows (items + cargo/buildings via `ItemsTable`/`EntityTable`) and the
  item/cargo/building detail headers.
- `NEXT_PUBLIC_ICON_BASE_URL` in `.env.example`; enablement docs.

**Out of scope (noted follow-ups):**
- Icons inside craft-graph/recipe stacks (needs `resolveRefs` to also fetch `icon_asset_name`
  and `StackView`/`resolveStackView` to carry it — a clean follow-up).
- Actual asset extraction/hosting (owner-involved; see Enablement).
- Per-image client-side onError fallback (kept server-only; assumes a complete icon set when a
  base URL is configured).

## Design

### `apps/web/lib/icons.ts` (pure)
```
const BASE = process.env.NEXT_PUBLIC_ICON_BASE_URL;  // read at module load
iconUrl(assetName: string | null | undefined): string | null
  - returns null if no BASE or no assetName
  - else `${BASE.replace(/\/$/, "")}/${assetName.split("/").map(encodeURIComponent).join("/")}.webp`
monogram(name: string): string
  - up to 2 chars: first letters of the first two words, uppercased; falls back to first 2 letters; "?" if empty
```
Both pure; `iconUrl` reads the env constant (testable by passing the base explicitly via an
internal `buildIconUrl(base, assetName)` that the env-bound `iconUrl` delegates to — unit-test
`buildIconUrl` and `monogram`).

### `apps/web/components/compendium/EntityIcon.tsx` (server component)
Props: `{ assetName?: string | null; name: string; rarity?: string | null; size?: number }`
(default size 32).
- `const url = iconUrl(assetName)`.
- If `url`: `<img src={url} alt={name} width={size} height={size} loading="lazy"
  className="rounded ... object-contain" />`.
- Else: a `size`×`size` rounded tile, rarity-tinted (reuse the rarity color map approach), with
  centered `monogram(name)` text. `aria-label={name}`.
- No `"use client"` — pure render.

### Wiring
- `ItemsTable` (items list) and `EntityTable` (cargo/buildings/recipes): render a small
  `EntityIcon` (size 24–28) in the Name cell before the link. `EntityRow` gains optional
  `iconAssetName?: string | null` and `rarity` (already present). Recipes have no
  `iconAssetName` → `EntityIcon` shows a monogram (acceptable) OR we pass no icon for recipes;
  decision: pass `assetName={row.iconAssetName ?? null}` so recipes get a monogram tile too
  (consistent row rhythm).
- Item / cargo / building detail headers: a larger `EntityIcon` (size 56–64) next to the `<h1>`.

### Enablement (docs — how to get REAL icons later)
1. Extract the game icon set from the install (`Icons.otf` / sprite atlas) using AssetRipper or
   AssetStudio, then the FontForge SVG-export recipe brico documents, OR export the sprite PNGs.
2. Convert to per-asset `webp` files named by their `icon_asset_name` path
   (`<base>/GeneratedIcons/Items/AncientGear.webp`) and host them (a CDN or `apps/web/public/icons`).
3. Set `NEXT_PUBLIC_ICON_BASE_URL` (e.g. `https://cdn.example.com/icons` or `/icons` if under
   `public/`). Real icons then render everywhere with no code change.
Licensing: game-extracted assets are the owner's call; keep them out of the public repo unless
cleared (use a CDN or a gitignored `public/icons`).

## Testing
- Unit (`apps/web/lib/icons.test.ts`): `buildIconUrl(base, assetName)` (null when base/assetName
  missing; correct URL incl. path-segment encoding) and `monogram` (two words → 2 letters; one
  word → up to 2 letters; empty → "?").
- Typecheck + bundle-safety grep.
- Runtime smoke: with no base set, list/detail render monogram tiles (no broken images);
  set a dummy `NEXT_PUBLIC_ICON_BASE_URL` and confirm `<img>` src is built correctly.

## UPDATE — real icons extracted (2026-06-05)

Owner has BitCraft dev-program access and the game installed, so real icons WERE
extracted (not just placeholders):
- Source: the Addressables bundle `remoteassets_assets__*.bundle` in the local
  install holds 5k+ `Sprite` objects at container paths
  `Assets/_Project/StaticAssets/_AddressedAssets/Sprites/GeneratedIcons/<Cat>/<Name>.png`.
- `scripts/extract-game-icons.py` (UnityPy + Pillow) exports each as a 128px
  `.webp` to `apps/web/public/icons/GeneratedIcons/<Cat>/<Name>.webp` (2,652 icons,
  ~7.5 MB) and writes `apps/web/lib/icon-manifest.json` (the set of available keys).
- `icons.ts` gained `normalizeIconAsset()` to reconcile the messy `icon_asset_name`
  values (strip `[params]`; take the tail after the LAST `GeneratedIcons/`), and
  `iconUrl`/`buildIconUrl` now consult the manifest so we never emit an `<img>` that
  would 404 (unmatched → monogram). Coverage: **items ~80%, cargo ~99%, buildings ~85%**.
- The extracted icons + manifest ARE committed (CI can't regenerate them — no game
  files), so deploys serve them from `/public`. Set `NEXT_PUBLIC_ICON_BASE_URL=/icons`
  in the deploy env (and `apps/web/.env.local` locally) to turn them on.
- Refresh after a game patch by re-running the extraction script.

## Verification & delivery
Lands on `main`, tests green, pushed. Final report documents that placeholders are showing and
the exact steps to enable real icons.
