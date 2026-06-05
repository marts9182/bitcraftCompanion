"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function ItemFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "tier", "rarity", "tag"]) {
      const v = String(form.get(key) ?? "").trim();
      if (v) next.set(key, v);
    }
    router.push(`/items?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 flex flex-wrap gap-2">
      <Input name="q" placeholder="Search items…" defaultValue={sp.get("q") ?? ""} className="max-w-xs" />
      <Input name="tier" placeholder="Tier" defaultValue={sp.get("tier") ?? ""} className="w-24" />
      <Input name="rarity" placeholder="Rarity" defaultValue={sp.get("rarity") ?? ""} className="w-36" />
      <Input name="tag" placeholder="Tag" defaultValue={sp.get("tag") ?? ""} className="w-40" />
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}
