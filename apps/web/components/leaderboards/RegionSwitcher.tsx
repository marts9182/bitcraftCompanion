"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function RegionSwitcher({ regions, current }: { regions: { region: string; name: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function onChange(region: string) {
    const next = new URLSearchParams(sp);
    if (region === "all") next.delete("region");
    else next.set("region", region);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      Region
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Region"
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="all">All regions</option>
        {regions.map((r) => (
          <option key={r.region} value={r.region}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
