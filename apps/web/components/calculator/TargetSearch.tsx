"use client";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function TargetSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    router.push(q ? `/calculator?q=${encodeURIComponent(q)}` : "/calculator");
  }
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input name="q" defaultValue={defaultValue} placeholder="Search items or cargo…" aria-label="Search craft target" className="max-w-sm" />
      <button type="submit" className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90">
        Search
      </button>
    </form>
  );
}
