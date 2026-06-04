import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;

/** Create (or reuse) a Drizzle Postgres client. Pass the DATABASE_URL explicitly. */
export function createDb(databaseUrl: string) {
  client ??= postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}

export { schema };
