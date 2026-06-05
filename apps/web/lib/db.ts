import { createDb, schema } from "@bcc/shared/db";

/**
 * Server-only Drizzle accessor for the web app. Reads DATABASE_URL from the
 * environment and reuses the underlying client (createDb memoizes internally).
 * Throws a clear error if the connection string is missing.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return createDb(url);
}

export { schema };
