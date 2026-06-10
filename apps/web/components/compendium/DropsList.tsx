import Link from "next/link";
import { EntityIcon } from "./EntityIcon";

/** One drop/yield entry. `refType` is the explicit item/cargo type tag from the game data. */
export interface DropEntry {
  id: number;
  refType: "item" | "cargo";
  qty: number;
  chance?: number;
}

/** The slice of an item/cargo row this list needs (getItemsByIds/getCargoByIds rows satisfy it). */
export interface DropRef {
  slug: string;
  name: string;
  rarity: string | null;
  iconAssetName: string | null;
}

function chanceLabel(chance: number): string {
  return `${(chance * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% chance`;
}

/**
 * Linked icon + name + quantity list shared by resource yields and creature
 * loot drops. Ids carry an explicit item/cargo type tag and the two id spaces
 * overlap (e.g. cargo 9 "Ardea" vs item 9), so resolve against the tagged
 * table first and only fall back to the other when the id is missing there.
 * Server component.
 */
export function DropsList({ entries, itemById, cargoById, emptyText }: {
  entries: DropEntry[];
  itemById: Map<number, DropRef>;
  cargoById: Map<number, DropRef>;
  emptyText: string;
}) {
  if (entries.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {entries.map((d, i) => {
        const item = itemById.get(d.id);
        const cargo = cargoById.get(d.id);
        const isCargo = d.refType === "cargo";
        const resolved = isCargo ? (cargo ?? item) : (item ?? cargo);
        const asCargo = isCargo ? cargo !== undefined : item === undefined && cargo !== undefined;
        return (
          <li key={`${d.id}-${i}`} className="flex items-center gap-2">
            {resolved ? (
              <>
                <EntityIcon
                  assetName={resolved.iconAssetName}
                  name={resolved.name}
                  rarity={resolved.rarity}
                  size={24}
                />
                <Link
                  href={asCargo ? `/cargo/${resolved.slug}` : `/items/${resolved.slug}`}
                  className="font-medium hover:underline"
                >
                  {resolved.name}
                </Link>
              </>
            ) : (
              <span className="text-muted-foreground">{isCargo ? `Cargo #${d.id}` : `Item #${d.id}`}</span>
            )}
            <span className="font-mono text-muted-foreground">× {d.qty}</span>
            {d.chance != null && d.chance < 1 && (
              <span className="text-xs text-muted-foreground">({chanceLabel(d.chance)})</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
