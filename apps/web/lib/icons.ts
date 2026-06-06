import manifest from "./icon-manifest.json";

/** Canonical icon keys that actually have an extracted image under public/icons. */
const AVAILABLE: ReadonlySet<string> = new Set(manifest as string[]);
const ICON_PREFIX = "GeneratedIcons/";

/**
 * Normalize a raw `icon_asset_name` to its canonical `GeneratedIcons/<…>` key.
 * The game data is inconsistent: values may carry a trailing `[params]` suffix
 * and/or nest the path (e.g. `GeneratedIcons/Other/GeneratedIcons/Items/Foo`).
 * We strip the `[…]` suffix and take the segment after the LAST `GeneratedIcons/`.
 * Returns null for blank input. Pure.
 */
export function normalizeIconAsset(assetName: string | null | undefined): string | null {
  if (!assetName) return null;
  let s = assetName.split("[")[0].trim().replace(/^\/+/, "");
  if (!s) return null;
  const li = s.lastIndexOf(ICON_PREFIX);
  if (li >= 0) s = s.slice(li + ICON_PREFIX.length);
  return ICON_PREFIX + s;
}

/**
 * Build an icon image URL, or null when unavailable. Returns null if there is no
 * base, the asset can't be normalized, or (when `available` is given) the icon
 * isn't in the manifest — so callers never emit an `<img>` that would 404. Pure.
 */
export function buildIconUrl(
  base: string | null | undefined,
  assetName: string | null | undefined,
  available?: ReadonlySet<string>,
): string | null {
  if (!base) return null;
  const rel = normalizeIconAsset(assetName);
  if (!rel) return null;
  if (available && !available.has(rel)) return null;
  const trimmed = base.replace(/\/+$/, "");
  const path = rel.split("/").map(encodeURIComponent).join("/");
  return `${trimmed}/${path}.webp`;
}

/**
 * Resolve an icon URL using `NEXT_PUBLIC_ICON_BASE_URL` and the extracted-icon
 * manifest. Null (→ placeholder) when no base is configured or no image exists.
 * Server-side usage.
 */
export function iconUrl(assetName: string | null | undefined): string | null {
  return buildIconUrl(process.env.NEXT_PUBLIC_ICON_BASE_URL, assetName, AVAILABLE);
}

/** 1–2 character monogram from a display name for the placeholder tile. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
