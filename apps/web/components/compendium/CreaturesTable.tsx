import Link from "next/link";
import { RarityBadge } from "./RarityBadge";
import { TierBadge } from "./TierBadge";
import { EntityIcon } from "./EntityIcon";
import { MobileCard } from "@/components/mobile/MobileCard";
import type { CreatureRow } from "@/lib/queries/creatures";

/** "15–27" (en dash), a single number when min = max or one side is missing, "—" if unknown. */
export function damageLabel(c: Pick<CreatureRow, "minDamage" | "maxDamage">): string {
  const { minDamage: min, maxDamage: max } = c;
  if (min == null && max == null) return "—";
  if (min == null || max == null || min === max) return String(min ?? max);
  return `${min}–${max}`;
}

export function CreaturesTable({ creatures }: { creatures: CreatureRow[] }) {
  if (creatures.length === 0) {
    return <p className="py-8 text-muted-foreground">No creatures match your search.</p>;
  }
  return (
    <>
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Tier</th>
            <th className="py-2 pr-4 font-medium">Rarity</th>
            <th className="py-2 pr-4 text-right font-medium">Health</th>
            <th className="py-2 pr-4 text-right font-medium">Damage</th>
            <th className="py-2 pr-4 text-right font-medium">Armor</th>
            <th className="py-2 pr-4 font-medium">Huntable</th>
            <th className="py-2 font-medium">Map</th>
          </tr>
        </thead>
        <tbody>
          {creatures.map((c) => (
            <tr key={c.enemyType} className="border-b border-border/50 hover:bg-muted/40">
              <td className="py-2 pr-4">
                <Link href={`/creatures/${c.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                  <EntityIcon assetName={c.iconAssetName} name={c.name} rarity={c.rarity} size={24} />
                  {c.name}
                </Link>
              </td>
              <td className="py-2 pr-4"><TierBadge tier={c.tier} /></td>
              <td className="py-2 pr-4"><RarityBadge rarity={c.rarity} /></td>
              <td className="py-2 pr-4 text-right font-mono">{c.maxHealth?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-4 text-right font-mono">{damageLabel(c)}</td>
              <td className="py-2 pr-4 text-right font-mono">{c.armor?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-4">{c.huntable ? "Yes" : "No"}</td>
              <td className="py-2 whitespace-nowrap">
                <Link href={`/map?creatures=${c.enemyType}`} className="text-primary hover:underline">
                  Find on map →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-3 md:hidden">
        {creatures.map((c) => (
          <MobileCard
            key={c.enemyType}
            title={
              <Link href={`/creatures/${c.slug}`} className="inline-flex items-center gap-2 hover:underline">
                <EntityIcon assetName={c.iconAssetName} name={c.name} rarity={c.rarity} size={20} />
                {c.name}
              </Link>
            }
            subtitle={
              [c.huntable ? "Huntable" : "Monster", c.tier != null && c.tier >= 0 ? `Tier ${c.tier}` : null]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            stats={[
              { label: "Rarity", value: c.rarity },
              { label: "Health", value: c.maxHealth?.toLocaleString() ?? "—" },
              { label: "Damage", value: damageLabel(c) },
              { label: "Armor", value: c.armor?.toLocaleString() ?? "—" },
              {
                label: "Map",
                value: (
                  <Link href={`/map?creatures=${c.enemyType}`} className="text-primary hover:underline">
                    Find →
                  </Link>
                ),
              },
            ]}
          />
        ))}
      </ul>
    </>
  );
}
