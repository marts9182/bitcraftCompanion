import { cn } from "@/lib/utils";

const RARITY_CLASS: Record<string, string> = {
  Default: "text-muted-foreground border-muted",
  Common: "text-zinc-300 border-zinc-500",
  Uncommon: "text-green-400 border-green-600",
  Rare: "text-blue-400 border-blue-600",
  Epic: "text-purple-400 border-purple-600",
  Legendary: "text-amber-400 border-amber-600",
  Mythic: "text-rose-400 border-rose-600",
};

export function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium",
        RARITY_CLASS[rarity] ?? RARITY_CLASS.Default,
      )}
    >
      {rarity}
    </span>
  );
}
