"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export interface FilterField {
  name: string;
  placeholder: string;
  kind?: "text" | "select";
  options?: { value: string; label: string }[];
  className?: string;
}

export function CompendiumFilters({ basePath, fields }: { basePath: string; fields: FilterField[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const f of fields) {
      const v = String(form.get(f.name) ?? "").trim();
      if (v) next.set(f.name, v);
    }
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 flex flex-wrap gap-2">
      {fields.map((f) =>
        f.kind === "select" ? (
          <select
            key={f.name}
            name={f.name}
            defaultValue={sp.get(f.name) ?? ""}
            className={`h-9 rounded-md border border-input bg-transparent px-3 text-sm ${f.className ?? ""}`}
          >
            <option value="">{f.placeholder}</option>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            key={f.name}
            name={f.name}
            placeholder={f.placeholder}
            defaultValue={sp.get(f.name) ?? ""}
            className={f.className ?? "max-w-xs"}
          />
        ),
      )}
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}
