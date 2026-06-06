import Link from "next/link";
import { RarityBadge } from "./RarityBadge";
import { TierBadge } from "./TierBadge";
import { RecipeTypeBadge } from "./RecipeTypeBadge";
import { EntityIcon } from "./EntityIcon";

export type EntityColumn = "tier" | "rarity" | "tag" | "type";

export interface EntityRow {
  id: number;
  slug: string;
  name: string;
  tier?: number | null;
  rarity?: string | null;
  tag?: string | null;
  type?: string | null;
  iconAssetName?: string | null;
}

const HEADER: Record<EntityColumn, string> = { tier: "Tier", rarity: "Rarity", tag: "Tag", type: "Type" };

export function EntityTable({
  rows,
  basePath,
  columns,
  emptyLabel = "No results.",
}: {
  rows: EntityRow[];
  basePath: string;
  columns: EntityColumn[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) return <p className="py-8 text-muted-foreground">{emptyLabel}</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Name</th>
          {columns.map((c) => (
            <th key={c} className="py-2 pr-4 font-medium">
              {HEADER[c]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
            <td className="py-2 pr-4">
              <Link href={`${basePath}/${r.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                <EntityIcon assetName={r.iconAssetName ?? null} name={r.name} rarity={r.rarity ?? null} size={24} />
                {r.name}
              </Link>
            </td>
            {columns.map((c) => (
              <td key={c} className="py-2 pr-4">
                {c === "tier" && <TierBadge tier={r.tier ?? null} />}
                {c === "rarity" && <RarityBadge rarity={r.rarity ?? "Default"} />}
                {c === "tag" && <span className="text-muted-foreground">{r.tag ?? "—"}</span>}
                {c === "type" && <RecipeTypeBadge type={r.type ?? ""} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
