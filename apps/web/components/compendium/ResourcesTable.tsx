import Link from "next/link";
import { RarityBadge } from "./RarityBadge";
import { TierBadge } from "./TierBadge";
import { EntityIcon } from "./EntityIcon";
import { MobileCard } from "@/components/mobile/MobileCard";
import { formatDuration } from "@/lib/calculator/format";
import type { ResourceRow } from "@/lib/queries/resources";

function respawnLabel(r: ResourceRow): string {
  if (r.notRespawning) return "Never";
  return formatDuration(r.respawnSeconds);
}

export function ResourcesTable({ resources }: { resources: ResourceRow[] }) {
  if (resources.length === 0) {
    return <p className="py-8 text-muted-foreground">No resources match your search.</p>;
  }
  return (
    <>
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 font-medium">Tier</th>
            <th className="py-2 pr-4 font-medium">Rarity</th>
            <th className="py-2 pr-4 text-right font-medium">Health</th>
            <th className="py-2 pr-4 text-right font-medium">Respawn</th>
            <th className="py-2 font-medium">Map</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
              <td className="py-2 pr-4">
                <Link href={`/resources/${r.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                  <EntityIcon assetName={r.iconAssetName} name={r.name} rarity={r.rarity} size={24} />
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{r.category ?? "—"}</td>
              <td className="py-2 pr-4"><TierBadge tier={r.tier} /></td>
              <td className="py-2 pr-4"><RarityBadge rarity={r.rarity} /></td>
              <td className="py-2 pr-4 text-right font-mono">{r.maxHealth?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-4 text-right font-mono">{respawnLabel(r)}</td>
              <td className="py-2 whitespace-nowrap">
                <Link href={`/map?resources=${r.id}`} className="text-primary hover:underline">
                  Find on map →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-3 md:hidden">
        {resources.map((r) => (
          <MobileCard
            key={r.id}
            title={
              <Link href={`/resources/${r.slug}`} className="inline-flex items-center gap-2 hover:underline">
                <EntityIcon assetName={r.iconAssetName} name={r.name} rarity={r.rarity} size={20} />
                {r.name}
              </Link>
            }
            subtitle={
              [r.category, r.tier != null && r.tier >= 0 ? `Tier ${r.tier}` : null]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            stats={[
              { label: "Rarity", value: r.rarity },
              { label: "Health", value: r.maxHealth?.toLocaleString() ?? "—" },
              { label: "Respawn", value: respawnLabel(r) },
              {
                label: "Map",
                value: (
                  <Link href={`/map?resources=${r.id}`} className="text-primary hover:underline">
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
