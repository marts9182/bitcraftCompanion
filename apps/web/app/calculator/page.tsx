import type { Metadata } from "next";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { TargetSearch } from "@/components/calculator/TargetSearch";
import { searchTargets } from "@/lib/queries/calculator-graph";

export const metadata: Metadata = {
  title: "Crafting Calculator",
  description: "Calculate the raw materials, time, and stamina needed to craft any item or cargo in BitCraft Online.",
  alternates: { canonical: "/calculator" },
};

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const hits = query ? await searchTargets(query) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Crafting Calculator</h1>
      <p className="mt-2 text-muted-foreground">
        Search for an item or cargo to see every raw material, plus the total time and stamina, needed to craft it.
      </p>
      <div className="mt-6">
        <TargetSearch defaultValue={query} />
      </div>
      {query && (
        <ul className="mt-6 divide-y divide-border">
          {hits.length === 0 && <li className="py-3 text-muted-foreground">No matches for “{query}”.</li>}
          {hits.map((h) => (
            <li key={`${h.refType}:${h.refId}`}>
              <Link href={`/calculator/${h.refType}/${h.slug}`} className="flex items-center gap-3 py-3 hover:underline">
                <EntityIcon assetName={h.iconAssetName} name={h.name} size={32} />
                <span>{h.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{h.refType}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
