import type { ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle != null && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );
}
