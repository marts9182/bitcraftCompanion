import Link from "next/link";

/**
 * Count-descending region links for a "Spawns in" section, shared by the
 * resource and creature detail pages. Takes the raw spawnCounts JSON
 * ({"7": 2993, …} region → live count) plus region rows for display names;
 * each row links into the map via the page-specific `hrefFor`. Server component.
 */
export function SpawnRegionsList({ spawnCounts, regions, hrefFor, emptyText }: {
  spawnCounts: Record<string, number>;
  regions: { id: number; name: string | null }[];
  hrefFor: (regionId: number) => string;
  emptyText: string;
}) {
  const names = new Map(regions.map((r) => [r.id, r.name]));
  const spawns = Object.entries(spawnCounts)
    .map(([regionId, count]) => ({ regionId: Number(regionId), count }))
    .sort((a, b) => b.count - a.count);
  if (spawns.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {spawns.map((s) => (
        <li key={s.regionId}>
          <Link href={hrefFor(s.regionId)} className="hover:underline">
            <span className="font-medium">{names.get(s.regionId) ?? `Region ${s.regionId}`}</span>
            <span className="text-muted-foreground"> — {s.count.toLocaleString()} spawn points</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
