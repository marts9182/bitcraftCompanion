import { createDb, schema } from "@bcc/shared/db";
import { desc } from "drizzle-orm";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return <main className="p-8">DATABASE_URL not configured.</main>;
  }
  const db = createDb(url);
  const runs = await db
    .select()
    .from(schema.ingestionRuns)
    .orderBy(desc(schema.ingestionRuns.startedAt))
    .limit(5);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Ingestion status</h1>
      <ul className="mt-4 space-y-2">
        {runs.length === 0 && <li className="text-muted-foreground">No ingestion runs yet.</li>}
        {runs.map((r) => (
          <li key={r.id} className="rounded border p-3 text-sm">
            <span className="font-mono">{r.status}</span> — {r.rowsUpserted} rows —{" "}
            {r.startedAt.toISOString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
