import { z } from "zod";

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"));

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  SPACETIME_URI: z.string().min(1),
  SPACETIME_MODULE: z.string().min(1),
  // The GLOBAL module holding the player roster (usernames, online, region map).
  SPACETIME_GLOBAL_MODULE: z.string().min(1).default("bitcraft-live-global"),
  // Optional override of the active region module list for the leaderboard snapshot,
  // e.g. "bitcraft-live-14". When unset, active regions are auto-discovered from the
  // global module's user_region_state (so it adapts as game state changes).
  SPACETIME_REGIONS: z.string().min(1).optional(),
  SPACETIME_TOKEN: z.string().min(1),
  // Optional: the public identity the token encodes. Not required to connect;
  // kept for reference and an optional connect-time sanity check.
  SPACETIME_IDENTITY: z.string().min(1).optional(),
  INGESTION_ENABLED: boolFromString.default(true),
  SPACETIME_APP_IDENTIFIER: z.string().min(1).default("BitCraftCompanion"),
  // Optional: after a successful snapshot the worker POSTs here to refresh the
  // web app's ISR pages. Both must be set to enable it; the secret must match
  // the web app's REVALIDATE_SECRET.
  REVALIDATE_URL: z.string().url().optional(),
  REVALIDATE_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parse and validate server-side env. Never import this from client code. */
export function parseServerEnv(source: Record<string, unknown> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  return result.data;
}
