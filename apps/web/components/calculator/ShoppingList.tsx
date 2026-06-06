import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import type { ShoppingLine } from "@/lib/calculator/types";

export function ShoppingList({ lines }: { lines: ShoppingLine[] }) {
  if (lines.length === 0) {
    return <p className="text-muted-foreground">This is a raw material — nothing to craft.</p>;
  }
  const sorted = [...lines].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {sorted.map((l) => (
        <li key={`${l.refType}:${l.refId}`} className="flex items-center gap-3 px-3 py-2">
          <EntityIcon assetName={l.iconAssetName} name={l.name} size={28} />
          {l.slug ? (
            <Link href={`/${l.refType === "item" ? "items" : "cargo"}/${l.slug}`} className="hover:underline">
              {l.name}
            </Link>
          ) : (
            <span>{l.name}</span>
          )}
          <span className="ml-auto font-mono text-sm">×{l.quantity}</span>
        </li>
      ))}
    </ul>
  );
}
