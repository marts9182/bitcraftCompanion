import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs from this package dir and does not read .env.local.
// Load the monorepo-root .env.local so DATABASE_URL is available.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local") });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
