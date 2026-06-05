import Link from "next/link";

function buildHref(searchParams: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v);
  sp.set("page", String(page));
  return `/items?${sp.toString()}`;
}

export function Pager({
  page,
  total,
  pageSize,
  searchParams,
}: {
  page: number;
  total: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={buildHref(searchParams, page - 1)} className="hover:underline">
          ← Previous
        </Link>
      ) : (
        <span className="text-muted-foreground">← Previous</span>
      )}
      <span className="text-muted-foreground">
        Page {page} of {lastPage}
      </span>
      {page < lastPage ? (
        <Link href={buildHref(searchParams, page + 1)} className="hover:underline">
          Next →
        </Link>
      ) : (
        <span className="text-muted-foreground">Next →</span>
      )}
    </nav>
  );
}
