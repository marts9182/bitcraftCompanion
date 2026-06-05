import Link from "next/link";
import { RarityBadge } from "./RarityBadge";
import { TierBadge } from "./TierBadge";
import type { ItemRow } from "@/lib/queries/items";

export function ItemsTable({ items }: { items: ItemRow[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-muted-foreground">No items match your search.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Tier</th>
          <th className="py-2 pr-4 font-medium">Rarity</th>
          <th className="py-2 font-medium">Tag</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} className="border-b border-border/50 hover:bg-muted/40">
            <td className="py-2 pr-4">
              <Link href={`/items/${it.slug}`} className="font-medium hover:underline">
                {it.name}
              </Link>
            </td>
            <td className="py-2 pr-4"><TierBadge tier={it.tier} /></td>
            <td className="py-2 pr-4"><RarityBadge rarity={it.rarity} /></td>
            <td className="py-2 text-muted-foreground">{it.tag ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
