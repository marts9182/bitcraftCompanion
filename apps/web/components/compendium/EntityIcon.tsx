import { iconUrl, monogram } from "@/lib/icons";
import { cn } from "@/lib/utils";

const RARITY_TINT: Record<string, string> = {
  Default: "bg-muted text-muted-foreground",
  Common: "bg-zinc-700/40 text-zinc-200",
  Uncommon: "bg-green-900/40 text-green-300",
  Rare: "bg-blue-900/40 text-blue-300",
  Epic: "bg-purple-900/40 text-purple-300",
  Legendary: "bg-amber-900/40 text-amber-300",
  Mythic: "bg-rose-900/40 text-rose-300",
};

/**
 * Entity icon. Renders the real image when NEXT_PUBLIC_ICON_BASE_URL is configured
 * (see docs/superpowers/specs/2026-06-05-compendium-icons-design.md), otherwise a
 * rarity-tinted monogram placeholder. Server component.
 */
export function EntityIcon({
  assetName,
  name,
  rarity,
  size = 32,
}: {
  assetName?: string | null;
  name: string;
  rarity?: string | null;
  size?: number;
}) {
  const url = iconUrl(assetName);
  if (url) {
    return (
      // Plain <img> on purpose: icons come from an external game-asset host, and
      // next/image would route them through Netlify's paid image CDN.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  const tint = RARITY_TINT[rarity ?? "Default"] ?? RARITY_TINT.Default;
  return (
    <span
      aria-label={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded font-medium", tint)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size * 0.4)) }}
    >
      {monogram(name)}
    </span>
  );
}
