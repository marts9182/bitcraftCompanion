import Link from "next/link";
import { getItemBySlug } from "@/lib/queries/items";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";

/** Live item embed for MDX: fetches the item by slug from Postgres at render time. */
export async function ItemCard({ slug }: { slug: string }) {
  const item = await getItemBySlug(slug);
  if (!item) {
    return (
      <span className="inline-flex items-center rounded border px-2 py-0.5 text-xs text-muted-foreground">
        unknown item: {slug}
      </span>
    );
  }
  return (
    <Link
      href={`/items/${item.slug}`}
      className="my-3 flex items-center gap-3 rounded-lg border p-3 no-underline hover:bg-muted/40"
    >
      <EntityIcon assetName={item.iconAssetName} name={item.name} rarity={item.rarity} size={40} />
      <span>
        <span className="block font-medium">{item.name}</span>
        <span className="mt-1 flex items-center gap-2">
          <TierBadge tier={item.tier} />
          <RarityBadge rarity={item.rarity} />
        </span>
      </span>
    </Link>
  );
}
