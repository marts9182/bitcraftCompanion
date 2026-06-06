/**
 * Build an icon image URL from an `icon_asset_name` and a base URL, or null if
 * either is missing. Each path segment is encoded but slashes are preserved, and
 * a `.webp` extension is appended. Pure — the base is passed in.
 */
export function buildIconUrl(base: string | undefined | null, assetName: string | null | undefined): string | null {
  if (!base || !assetName) return null;
  const trimmed = base.replace(/\/+$/, "");
  const path = assetName.split("/").map(encodeURIComponent).join("/");
  return `${trimmed}/${path}.webp`;
}

/**
 * Resolve an icon URL using the configured `NEXT_PUBLIC_ICON_BASE_URL`. Returns
 * null (→ placeholder) when no base is configured. Server-side only usage.
 */
export function iconUrl(assetName: string | null | undefined): string | null {
  return buildIconUrl(process.env.NEXT_PUBLIC_ICON_BASE_URL, assetName);
}

/** 1–2 character monogram from a display name for the placeholder tile. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
