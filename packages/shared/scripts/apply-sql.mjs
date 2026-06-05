// Apply a Drizzle-generated SQL migration file directly, statement by statement.
// Used because `drizzle-kit push` mis-handles the existing uuid PK tables on this
// database; the generated migrations are idempotent (IF NOT EXISTS), so applying
// them directly is safe and re-runnable.
//
// Usage: node scripts/apply-sql.mjs drizzle/0001_slippery_nicolaos.sql
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env.local") });

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-sql.mjs <path-to-sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (check .env.local)");
  process.exit(1);
}

const sqlText = readFileSync(resolve(here, "..", file), "utf8");
const statements = sqlText
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const sql = postgres(url, { prepare: false });
try {
  for (const [i, stmt] of statements.entries()) {
    await sql.unsafe(stmt);
    console.log(`[apply-sql] ok statement ${i + 1}/${statements.length}`);
  }
  console.log(`[apply-sql] applied ${statements.length} statements from ${file}`);
} catch (err) {
  console.error("[apply-sql] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
