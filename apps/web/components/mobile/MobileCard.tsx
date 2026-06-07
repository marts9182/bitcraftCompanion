import Link from "next/link";
import type { ReactNode } from "react";

export interface MobileCardStat {
  label: string;
  value: ReactNode;
}

/** A single mobile list row rendered as a card: optional rank + title (links to
 *  detail when href is given), optional subtitle, and a row of labelled stat chips.
 *  Used below the `md` breakpoint in place of wide tables. */
export function MobileCard({
  href,
  title,
  subtitle,
  rank,
  stats,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  rank?: number | string;
  stats: MobileCardStat[];
}) {
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        {rank != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rank}</span>}
        <span className="font-semibold text-foreground group-hover:text-primary">{title}</span>
      </div>
      {subtitle != null && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      {stats.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {stats.map((s, i) => (
            <div key={i}>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</dt>
              <dd className="text-sm tabular-nums text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
  const cls = "group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50";
  return <li>{href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}
