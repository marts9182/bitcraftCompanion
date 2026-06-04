# BitCraft Companion — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a secure pnpm monorepo (Next.js web + TypeScript ingestion worker + shared DB/types) with a read-only SpacetimeDB connection spike, so Phase 1 (Compendium) can be built on a proven foundation.

**Architecture:** One pnpm-workspace monorepo. `apps/worker` is the only component that touches the game — it connects to SpacetimeDB read-only (subscribe only, never calls reducers) and upserts into Postgres. `apps/web` (Next.js App Router) reads only from Postgres. `packages/shared` holds the Drizzle schema, env validation, and a read-only connection wrapper that structurally cannot call reducers. Security is established **before** any credential exists: `.env*` is gitignored, secrets are server-side only, and gitleaks runs in CI + pre-commit.

**Tech Stack:** pnpm workspaces, TypeScript, Next.js 15 (App Router), Tailwind CSS v4 + shadcn/ui, Drizzle ORM + Postgres (Neon/Supabase), Vitest, `@clockworklabs/spacetimedb-sdk`, Husky, gitleaks.

**Spec:** `docs/superpowers/specs/2026-06-04-bitcraft-companion-design.md`

---

## Prerequisites (the engineer must have these before starting)

Document only — not a code task. The implementer needs:

- **Node.js 20+** and **pnpm 9+** (`npm install -g pnpm`).
- **Git** configured.
- A **Postgres database URL** — create a free project on Neon (https://neon.tech) or Supabase. Copy the connection string (with `sslmode=require`).
- **SpacetimeDB connection details** from the site owner's dev access: the **host URI**, the **module/database name**, and the **identity token**. These go in `.env.local` only — never in chat, issues, or commits.
- Optional but recommended: the **SpacetimeDB CLI** (`spacetime`) for generating typed bindings (https://spacetimedb.com/install). The spike works without generated bindings using untyped subscriptions; bindings are a Phase 1 nicety.

> **Security rule for the whole plan:** never paste the token anywhere tracked by git. Only `.env.local` (gitignored) holds it. If you ever see a real secret in a file that git tracks, stop and remove it.

---

## File Structure

Created in this plan:

```
.
├── package.json                      # root: workspace scripts, devDeps (husky, gitleaks config)
├── pnpm-workspace.yaml               # workspace globs
├── .npmrc                            # pnpm settings
├── tsconfig.base.json                # shared TS config
├── .gitignore                        # ignores .env*, node_modules, build output
├── .env.example                      # documents every env key (placeholders only)
├── .gitleaks.toml                    # secret-scanning config
├── .husky/pre-commit                 # blocks .env* + runs guards
├── vitest.config.ts                  # root test config (workspace)
├── README.md                         # setup, run, security docs
├── scripts/
│   └── check-no-env-committed.mjs     # pre-commit guard: reject staged .env* (except .env.example)
├── .github/workflows/
│   ├── ci.yml                        # install, typecheck, lint, build, test
│   └── secrets.yml                   # gitleaks scan
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── env.ts                # zod-validated env loader (server-side)
│       │   ├── env.test.ts
│       │   ├── db/
│       │   │   ├── client.ts         # Drizzle client
│       │   │   └── schema.ts         # Phase 0 tables: ingestion_runs, raw_snapshots
│       │   ├── spacetime/
│       │   │   ├── readonly-connection.ts   # read-only wrapper (no reducer surface)
│       │   │   └── readonly-connection.test.ts
│       │   └── index.ts
│       └── drizzle.config.ts
├── apps/
│   ├── worker/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts               # entry: kill switch, connect, subscribe, backoff
│   │       ├── ingest.ts             # subscribe handler -> raw_snapshots upsert
│   │       └── ingest.test.ts
│   └── web/
│       ├── (created by create-next-app)
│       ├── app/layout.tsx            # root layout + SEO metadata defaults
│       ├── app/page.tsx              # landing placeholder
│       ├── app/status/page.tsx       # reads ingestion_runs from Postgres
│       ├── app/sitemap.ts            # dynamic sitemap
│       ├── app/robots.ts             # robots.txt
│       └── lib/seo.ts                # shared metadata helpers + JSON-LD
```

---

## Task 1: Initialize the pnpm monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`

- [ ] **Step 1: Create the workspace manifest**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create `.npmrc`**

Create `.npmrc`:

```ini
# Keep dependency resolution strict and reproducible
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 3: Create the root `package.json`**

Create `package.json`:

```json
{
  "name": "bitcraft-companion",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "dev:web": "pnpm --filter @bcc/web dev",
    "dev:worker": "pnpm --filter @bcc/worker dev",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "vitest run",
    "prepare": "husky"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "husky": "^9.1.0"
  }
}
```

- [ ] **Step 4: Create the base TS config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install`
Expected: completes, creates `node_modules` and `pnpm-lock.yaml`, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: initialize pnpm monorepo workspace"
```

---

## Task 2: Security baseline (do this BEFORE any credential exists)

**Files:**
- Create: `.gitignore`, `.env.example`, `.gitleaks.toml`, `scripts/check-no-env-committed.mjs`, `.husky/pre-commit`

- [ ] **Step 1: Create `.gitignore`**

Create `.gitignore`:

```gitignore
# dependencies
node_modules/
.pnpm-store/

# env & secrets — NEVER commit these
.env
.env.*
!.env.example

# build output
dist/
.next/
out/
build/
*.tsbuildinfo

# misc
.DS_Store
coverage/
*.log
```

- [ ] **Step 2: Create `.env.example` (placeholders only, no real values)**

Create `.env.example`:

```dotenv
# ---- Database (server-side only) ----
# Postgres connection string from Neon/Supabase (include sslmode=require)
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"

# ---- SpacetimeDB (server-side only — used by apps/worker) ----
# Host URI of the game's SpacetimeDB instance
SPACETIME_URI="wss://REPLACE_WITH_HOST"
# Module / database name to subscribe to
SPACETIME_MODULE="REPLACE_WITH_MODULE_NAME"
# Dev identity token. NEVER commit a real value. Put the real one in .env.local only.
SPACETIME_TOKEN="REPLACE_WITH_TOKEN"

# Kill switch: set to "false" to instantly pause all game ingestion
INGESTION_ENABLED="true"

# Polite client identification sent to upstream
SPACETIME_APP_IDENTIFIER="BitCraftCompanion (contact: REPLACE_WITH_CONTACT)"

# ---- Web (public values may use NEXT_PUBLIC_ prefix; secrets must NOT) ----
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **Step 3: Create the gitleaks config**

Create `.gitleaks.toml`:

```toml
title = "BitCraft Companion gitleaks config"

[extend]
useDefault = true

[allowlist]
description = "Allow placeholder values in the documented example env file"
paths = ['''\.env\.example$''']
regexes = [
  '''REPLACE_WITH_[A-Z_]+''',
  '''USER:PASSWORD@HOST''',
]
```

- [ ] **Step 4: Create the pre-commit guard script**

Create `scripts/check-no-env-committed.mjs`:

```js
#!/usr/bin/env node
// Blocks committing any .env* file except .env.example.
// Cross-platform (no binary required) so the critical guard always runs.
import { execSync } from "node:child_process";

const staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
  encoding: "utf8",
})
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const offenders = staged.filter((f) => {
  const base = f.split("/").pop() ?? f;
  return base.startsWith(".env") && base !== ".env.example";
});

if (offenders.length > 0) {
  console.error("\n✖ Refusing to commit env file(s) that may contain secrets:");
  for (const f of offenders) console.error(`  - ${f}`);
  console.error("\nOnly .env.example may be committed. Remove these from the commit.\n");
  process.exit(1);
}
```

- [ ] **Step 5: Initialize Husky and create the hook**

Run: `pnpm install` then `pnpm exec husky init`
This creates `.husky/`. Replace the contents of `.husky/pre-commit` with:

```sh
node scripts/check-no-env-committed.mjs

# Run gitleaks if it is installed locally (CI always runs it regardless)
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --config .gitleaks.toml
fi
```

- [ ] **Step 6: Verify the guard actually blocks**

Run:
```bash
echo "SPACETIME_TOKEN=should-be-blocked" > .env.local
git add -f .env.local
node scripts/check-no-env-committed.mjs; echo "exit=$?"
```
Expected: prints the refusal message and `exit=1`.

Then clean up:
```bash
git reset .env.local
rm .env.local
```
Expected: `.env.local` is no longer staged and is deleted.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example .gitleaks.toml scripts/check-no-env-committed.mjs .husky/pre-commit package.json pnpm-lock.yaml
git commit -m "chore(security): gitignore env, env.example, gitleaks config, pre-commit guard"
```

---

## Task 3: CI workflows (typecheck/build/test + gitleaks)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/secrets.yml`

- [ ] **Step 1: Create the secret-scanning workflow**

Create `.github/workflows/secrets.yml`:

```yaml
name: secrets
on:
  push:
  pull_request:
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITLEAKS_CONFIG: .gitleaks.toml
```

- [ ] **Step 2: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/secrets.yml
git commit -m "ci: add typecheck/lint/test/build and gitleaks workflows"
```

> **Manual follow-up (document in README, Task 8):** in GitHub repo settings, enable **Secret scanning** and **Push protection** (Settings → Code security and analysis).

---

## Task 4: `packages/shared` — env validation (TDD)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/env.ts`, `packages/shared/src/env.test.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/shared/package.json`:

```json
{
  "name": "@bcc/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./env": "./src/env.ts",
    "./db": "./src/db/client.ts",
    "./db/schema": "./src/db/schema.ts",
    "./spacetime": "./src/spacetime/readonly-connection.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "echo \"(no lint configured for shared yet)\"",
    "build": "echo \"(shared is consumed as TS source)\""
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "@clockworklabs/spacetimedb-sdk": "^0.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "types": ["node"] },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/shared/src/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseServerEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@h/db?sslmode=require",
  SPACETIME_URI: "wss://example.test",
  SPACETIME_MODULE: "bitcraft",
  SPACETIME_TOKEN: "tok",
  INGESTION_ENABLED: "true",
  SPACETIME_APP_IDENTIFIER: "BitCraftCompanion",
};

describe("parseServerEnv", () => {
  it("parses a valid env and coerces the kill switch to boolean", () => {
    const env = parseServerEnv(base);
    expect(env.INGESTION_ENABLED).toBe(true);
    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("treats INGESTION_ENABLED=false as a disabled kill switch", () => {
    const env = parseServerEnv({ ...base, INGESTION_ENABLED: "false" });
    expect(env.INGESTION_ENABLED).toBe(false);
  });

  it("throws when a required secret is missing", () => {
    const { SPACETIME_TOKEN, ...withoutToken } = base;
    expect(() => parseServerEnv(withoutToken)).toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run packages/shared/src/env.test.ts`
Expected: FAIL — `parseServerEnv` is not exported / module not found.

- [ ] **Step 5: Implement `env.ts`**

Create `packages/shared/src/env.ts`:

```ts
import { z } from "zod";

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"));

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  SPACETIME_URI: z.string().min(1),
  SPACETIME_MODULE: z.string().min(1),
  SPACETIME_TOKEN: z.string().min(1),
  INGESTION_ENABLED: boolFromString.default(true),
  SPACETIME_APP_IDENTIFIER: z.string().min(1).default("BitCraftCompanion"),
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
```

- [ ] **Step 6: Create the package barrel**

Create `packages/shared/src/index.ts`:

```ts
export * from "./env";
```

- [ ] **Step 7: Install deps and run the test to verify it passes**

Run: `pnpm install` then `pnpm vitest run packages/shared/src/env.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): zod-validated server env loader with ingestion kill switch"
```

---

## Task 5: `packages/shared` — Drizzle schema + client

**Files:**
- Create: `packages/shared/src/db/schema.ts`, `packages/shared/src/db/client.ts`, `packages/shared/drizzle.config.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the Phase 0 schema**

Create `packages/shared/src/db/schema.ts`:

```ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

/** Audit row written by the worker for each ingestion run. */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // "running" | "ok" | "error"
  rowsUpserted: integer("rows_upserted").default(0).notNull(),
  error: text("error"),
});

/** Generic raw payload storage keyed by source table + entity id (resilience / reprocessing). */
export const rawSnapshots = pgTable("raw_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceTable: text("source_table").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewRawSnapshot = typeof rawSnapshots.$inferInsert;
```

- [ ] **Step 2: Create the Drizzle client**

Create `packages/shared/src/db/client.ts`:

```ts
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
```

- [ ] **Step 3: Create the drizzle-kit config**

Create `packages/shared/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 4: Export from the barrel**

Replace `packages/shared/src/index.ts` with:

```ts
export * from "./env";
export * as schema from "./db/schema";
export { createDb } from "./db/client";
```

- [ ] **Step 5: Add db scripts to the package**

In `packages/shared/package.json`, add to `scripts`:

```json
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push"
```

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Generate the migration (offline, no DB needed)**

Run: `pnpm --filter @bcc/shared db:generate`
Expected: creates SQL migration files under `packages/shared/drizzle/`.

> **Manual (needs real DB):** with `DATABASE_URL` set in `.env.local`, the implementer later runs `pnpm --filter @bcc/shared db:push` to apply the schema. Document in README.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): Drizzle schema (ingestion_runs, raw_snapshots) + Postgres client"
```

---

## Task 6: `packages/shared` — read-only SpacetimeDB wrapper (TDD)

**Goal:** A wrapper whose public surface allows only connect + read subscriptions and exposes **no way to call a reducer**, enforcing the "do not affect the game" requirement structurally. A test asserts the wrapper exposes no reducer-calling method.

**Files:**
- Create: `packages/shared/src/spacetime/readonly-connection.ts`, `packages/shared/src/spacetime/readonly-connection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/spacetime/readonly-connection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ReadOnlySpacetime } from "./readonly-connection";

describe("ReadOnlySpacetime", () => {
  it("exposes only read/connection methods (no reducer-calling surface)", () => {
    const allowed = new Set(["connect", "disconnect", "subscribe", "onConnect", "onError", "isConnected"]);
    const surface = Object.getOwnPropertyNames(ReadOnlySpacetime.prototype).filter((n) => n !== "constructor");
    for (const name of surface) {
      expect(allowed.has(name), `unexpected public method: ${name}`).toBe(true);
    }
    // Explicitly assert no method name hints at mutating the game.
    const forbidden = surface.filter((n) => /reduc|call|invoke|insert|update|delete|mutat|write/i.test(n));
    expect(forbidden).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/shared/src/spacetime/readonly-connection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the wrapper**

Create `packages/shared/src/spacetime/readonly-connection.ts`:

```ts
import { DbConnection } from "@clockworklabs/spacetimedb-sdk";

export interface ReadOnlyConfig {
  uri: string;
  moduleName: string;
  token: string;
}

type RowHandler = (table: string, row: unknown) => void;

/**
 * Read-only SpacetimeDB connection. By design this class exposes NO method to
 * call a reducer — the only mutation path in SpacetimeDB — so it cannot affect
 * the live game. It can only connect and subscribe to table data.
 */
export class ReadOnlySpacetime {
  #conn: DbConnection | undefined;
  #connected = false;

  constructor(private readonly config: ReadOnlyConfig) {}

  isConnected(): boolean {
    return this.#connected;
  }

  connect(handlers: { onConnect?: () => void; onError?: (e: unknown) => void } = {}): void {
    this.#conn = DbConnection.builder()
      .withUri(this.config.uri)
      .withModuleName(this.config.moduleName)
      .withToken(this.config.token)
      .onConnect(() => {
        this.#connected = true;
        handlers.onConnect?.();
      })
      .onConnectError((_ctx, err) => handlers.onError?.(err))
      .onDisconnect(() => {
        this.#connected = false;
      })
      .build();
  }

  onConnect(cb: () => void): void {
    // convenience for callers that connect() before registering
    if (this.#connected) cb();
  }

  onError(_cb: (e: unknown) => void): void {
    // reserved: error routing is wired in connect(); kept for API symmetry
  }

  /**
   * Subscribe (read-only) to one or more SQL subscription queries and receive
   * inserted/updated rows. Never issues a reducer call.
   */
  subscribe(queries: string[], onRow: RowHandler): void {
    if (!this.#conn) throw new Error("connect() must be called before subscribe()");
    this.#conn
      .subscriptionBuilder()
      .onApplied(() => {
        /* initial snapshot applied */
      })
      .subscribe(queries);

    // Generic row routing across all tables exposed on conn.db.
    const db = this.#conn.db as unknown as Record<string, { onInsert?: Function; onUpdate?: Function }>;
    for (const [table, handle] of Object.entries(db)) {
      handle.onInsert?.((_ctx: unknown, row: unknown) => onRow(table, row));
      handle.onUpdate?.((_ctx: unknown, _old: unknown, row: unknown) => onRow(table, row));
    }
  }

  disconnect(): void {
    this.#conn?.disconnect?.();
    this.#connected = false;
  }
}
```

> **Note for the implementer:** the exact `@clockworklabs/spacetimedb-sdk` builder method names (`withModuleName` vs `withDatabaseName`, subscription API) can vary by SDK version. Verify against the installed version's types during the connection spike (Task 8). The **public surface of this class must not change** — only its internals. Keep the test green.

- [ ] **Step 4: Export from the barrel**

Add to `packages/shared/src/index.ts`:

```ts
export { ReadOnlySpacetime } from "./spacetime/readonly-connection";
export type { ReadOnlyConfig } from "./spacetime/readonly-connection";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packages/shared/src/spacetime/readonly-connection.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): read-only SpacetimeDB wrapper (no reducer surface, structurally safe)"
```

---

## Task 7: `apps/worker` — ingestion entry with kill switch (TDD for the guard)

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/ingest.ts`, `apps/worker/src/ingest.test.ts`, `apps/worker/src/main.ts`

- [ ] **Step 1: Create the package manifest**

Create `apps/worker/package.json`:

```json
{
  "name": "@bcc/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts",
    "typecheck": "tsc --noEmit",
    "lint": "echo \"(no lint configured for worker yet)\"",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@bcc/shared": "workspace:*",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create the worker tsconfig**

Create `apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test for the run guard**

Create `apps/worker/src/ingest.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { shouldRunIngestion, computeBackoffMs } from "./ingest";

describe("shouldRunIngestion", () => {
  it("returns false when the kill switch is disabled", () => {
    expect(shouldRunIngestion({ INGESTION_ENABLED: false })).toBe(false);
  });
  it("returns true when enabled", () => {
    expect(shouldRunIngestion({ INGESTION_ENABLED: true })).toBe(true);
  });
});

describe("computeBackoffMs", () => {
  it("grows exponentially and caps at the max", () => {
    expect(computeBackoffMs(0)).toBeLessThanOrEqual(2000);
    expect(computeBackoffMs(10)).toBeLessThanOrEqual(60_000);
    expect(computeBackoffMs(10)).toBeGreaterThan(computeBackoffMs(0));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run apps/worker/src/ingest.test.ts`
Expected: FAIL — functions not found.

- [ ] **Step 5: Implement `ingest.ts`**

Create `apps/worker/src/ingest.ts`:

```ts
import { createDb, schema, ReadOnlySpacetime, type ServerEnv } from "@bcc/shared";

/** The kill switch: ingestion only runs when explicitly enabled. */
export function shouldRunIngestion(env: Pick<ServerEnv, "INGESTION_ENABLED">): boolean {
  return env.INGESTION_ENABLED === true;
}

/** Exponential backoff with a 60s cap and small jitter-free base for determinism in tests. */
export function computeBackoffMs(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  return Math.min(base, 60_000);
}

/** Wire a read-only subscription to raw_snapshots upserts. */
export function startIngestion(env: ServerEnv): ReadOnlySpacetime {
  const db = createDb(env.DATABASE_URL);
  const sky = new ReadOnlySpacetime({
    uri: env.SPACETIME_URI,
    moduleName: env.SPACETIME_MODULE,
    token: env.SPACETIME_TOKEN,
  });

  sky.connect({
    onConnect: () => {
      console.log("[worker] connected (read-only) to SpacetimeDB");
      // Phase 0 spike: subscribe to a single small table to prove the path.
      // Phase 1 will replace this with the real compendium tables.
      sky.subscribe(["SELECT * FROM player LIMIT 1"], async (table, row) => {
        await db.insert(schema.rawSnapshots).values({
          sourceTable: table,
          entityId: String((row as { entity_id?: unknown })?.entity_id ?? "unknown"),
          payload: row as object,
        });
      });
    },
    onError: (e) => console.error("[worker] connection error:", e),
  });

  return sky;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm install` then `pnpm vitest run apps/worker/src/ingest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Implement `main.ts` (entry with kill switch + backoff loop)**

Create `apps/worker/src/main.ts`:

```ts
import "dotenv/config";
import { parseServerEnv } from "@bcc/shared";
import { shouldRunIngestion, startIngestion, computeBackoffMs } from "./ingest";

async function main() {
  const env = parseServerEnv();

  if (!shouldRunIngestion(env)) {
    console.warn("[worker] INGESTION_ENABLED=false — kill switch active, exiting without connecting.");
    process.exit(0);
  }

  let attempt = 0;
  const connection = startIngestion(env);

  const shutdown = () => {
    console.log("[worker] shutting down…");
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Minimal reconnect supervisor for the spike.
  setInterval(() => {
    if (!connection.isConnected()) {
      const delay = computeBackoffMs(attempt++);
      console.warn(`[worker] not connected; next supervisor tick uses backoff ${delay}ms`);
    } else {
      attempt = 0;
    }
  }, 5000);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 8: Verify typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/worker pnpm-lock.yaml
git commit -m "feat(worker): ingestion entry with kill switch, backoff, read-only subscribe"
```

---

## Task 8: Connection spike (manual verification with real credentials)

**Goal:** Prove the worker connects read-only to the real game SpacetimeDB and writes a `raw_snapshots` row — without ever calling a reducer.

> This task needs real values in `.env.local` and a real `DATABASE_URL`. It is a **manual verification**, not automated (no secrets in CI).

- [ ] **Step 1: Create your local env**

```bash
cp .env.example .env.local
```
Then edit `.env.local` and fill in the real `DATABASE_URL`, `SPACETIME_URI`, `SPACETIME_MODULE`, and `SPACETIME_TOKEN`. (This file is gitignored.)

- [ ] **Step 2: Apply the DB schema**

Run: `pnpm --filter @bcc/shared db:push`
Expected: tables `ingestion_runs` and `raw_snapshots` created in your Postgres.

- [ ] **Step 3: Confirm the real SDK API shape**

Run: `pnpm --filter @bcc/shared exec tsc --noEmit`
If the SDK's builder method names differ from the wrapper (e.g. `withDatabaseName` instead of `withModuleName`), adjust **only the internals** of `readonly-connection.ts`. Re-run its test to confirm the public surface is unchanged:
Run: `pnpm vitest run packages/shared/src/spacetime/readonly-connection.test.ts`
Expected: PASS.

Also confirm the correct subscription table name for the spike (replace `player` in `ingest.ts` if needed — use any small table from the module's schema reference).

- [ ] **Step 4: Run the worker**

Run: `pnpm dev:worker`
Expected: logs `[worker] connected (read-only) to SpacetimeDB`, then a `raw_snapshots` row is written. Verify with a quick query in your DB console: `SELECT count(*) FROM raw_snapshots;` → ≥ 1.

- [ ] **Step 5: Verify the kill switch**

Set `INGESTION_ENABLED="false"` in `.env.local`, run `pnpm dev:worker`.
Expected: logs the kill-switch warning and exits **without connecting**. Restore to `true` afterward.

- [ ] **Step 6: Record the spike result**

Append a short "Connection spike — confirmed working on YYYY-MM-DD; real table names observed: …" note to the spec's section 14, and commit that doc change (no secrets):

```bash
git add docs/superpowers/specs/2026-06-04-bitcraft-companion-design.md
git commit -m "docs: record successful read-only SpacetimeDB connection spike"
```

---

## Task 9: `apps/web` — Next.js shell with SEO defaults

**Files:**
- Create via CLI, then add: `apps/web/lib/seo.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`, `apps/web/app/status/page.tsx`

- [ ] **Step 1: Scaffold the Next.js app**

Run:
```bash
pnpm dlx create-next-app@latest apps/web --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-pnpm --no-turbopack
```
Then set the package name: edit `apps/web/package.json` and change `"name"` to `"@bcc/web"`, and ensure scripts include `"typecheck": "tsc --noEmit"` and `"lint": "next lint"`.

- [ ] **Step 2: Add the shared dependency and install**

In `apps/web/package.json` `dependencies`, add `"@bcc/shared": "workspace:*"`. Then run `pnpm install`.
Expected: installs, links the workspace package.

- [ ] **Step 3: Initialize shadcn/ui**

Run: `pnpm dlx shadcn@latest init` (choose defaults; base color of your choice). Then add a couple of primitives: `pnpm dlx shadcn@latest add button card`.
Expected: creates `components/ui/*` and `lib/utils.ts`.

- [ ] **Step 4: Create the SEO helper + JSON-LD**

Create `apps/web/lib/seo.ts`:

```ts
import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_NAME = "BitCraft Companion";

export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — The BitCraft Online companion`, template: `%s · ${SITE_NAME}` },
  description:
    "The fast, comprehensive companion for BitCraft Online: item & recipe compendium, guides, and live game data.",
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, url: SITE_URL },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };
}
```

- [ ] **Step 5: Set the root layout metadata + JSON-LD**

Replace `apps/web/app/layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";

export const metadata = defaultMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
        />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Create a minimal landing page**

Replace `apps/web/app/page.tsx` with:

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">BitCraft Companion</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The fast, comprehensive companion for BitCraft Online. Compendium, guides, and live data —
        coming online.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Add sitemap and robots routes**

Create `apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 }];
}
```

Create `apps/web/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 8: Create the status page (proves web → Postgres read path)**

Create `apps/web/app/status/page.tsx`:

```tsx
import { createDb, schema } from "@bcc/shared";
import { desc } from "drizzle-orm";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return <main className="p-8">DATABASE_URL not configured.</main>;
  }
  const db = createDb(url);
  const runs = await db.select().from(schema.ingestionRuns).orderBy(desc(schema.ingestionRuns.startedAt)).limit(5);

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
```

- [ ] **Step 9: Add security headers**

Create `apps/web/next.config.ts` (or edit the generated one) to add headers:

```ts
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

- [ ] **Step 10: Verify build and dev**

Run: `pnpm --filter @bcc/web build`
Expected: build succeeds (the `/status` page is dynamic and won't fail the build without a DB).
Run: `pnpm dev:web` and open http://localhost:3000 — landing renders; `/sitemap.xml` and `/robots.txt` resolve.

- [ ] **Step 11: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Next.js shell with SEO defaults, sitemap/robots, security headers, status page"
```

---

## Task 10: Root Vitest config + final wiring

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the root Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (env: 3, readonly-connection: 1, ingest: 4).

- [ ] **Step 3: Run typecheck across the workspace**

Run: `pnpm typecheck`
Expected: PASS for `@bcc/shared`, `@bcc/worker`, `@bcc/web`.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "test: add root vitest workspace config"
```

---

## Task 11: README + documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# BitCraft Companion

The fast, comprehensive companion site for BitCraft Online — compendium, guides, and live game data. Community-built; not affiliated with Clockwork Labs.

## Architecture

- `apps/web` — Next.js (App Router) site. Reads only from Postgres. Never connects to the game.
- `apps/worker` — long-running TypeScript worker. The **only** component that touches the game; connects to SpacetimeDB **read-only** (subscribe only, never calls reducers).
- `packages/shared` — Drizzle schema, env validation, and the read-only SpacetimeDB wrapper.

## Setup

1. Install: `pnpm install`
2. Copy env: `cp .env.example .env.local` and fill in real values (see below).
3. Apply DB schema: `pnpm --filter @bcc/shared db:push`
4. Run worker: `pnpm dev:worker`
5. Run web: `pnpm dev:web`

## Environment

All secrets live in `.env.local` (gitignored) and are used **server-side only**. Never commit real values; `.env.example` documents every key. See `.env.example`.

## Security

- `.env*` (except `.env.example`) is gitignored; a pre-commit guard blocks committing env files.
- gitleaks runs in CI (`.github/workflows/secrets.yml`) and locally via the pre-commit hook if installed.
- **Enable in GitHub repo settings:** Settings → Code security and analysis → enable **Secret scanning** and **Push protection**.
- The SpacetimeDB token is never exposed to the browser (no `NEXT_PUBLIC_` prefix).

## Do-not-affect-the-game guarantees

- The worker uses `ReadOnlySpacetime`, which exposes no reducer-calling method.
- One shared connection (never per-visitor), with backoff on reconnect.
- Kill switch: set `INGESTION_ENABLED=false` to pause all ingestion instantly.

## Scripts

- `pnpm test` — run all tests
- `pnpm typecheck` — typecheck all packages
- `pnpm build` — build all packages
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, security, and do-not-affect-the-game notes"
```

- [ ] **Step 3: Push the branch**

Run: `git push -u origin <branch>`
Expected: pushes; CI (`ci.yml` + `secrets.yml`) runs green.

---

## Self-Review (completed by plan author)

**Spec coverage check (spec → task):**
- §3/§4 architecture & monorepo components → Tasks 1, 4–9 ✅
- §5 tech choices → Tasks 1, 4, 5, 9 ✅
- §6 do-not-affect-the-game (subscribe-only, kill switch, backoff, identifier) → Tasks 6 (wrapper), 7 (kill switch/backoff), env identifier in `.env.example` ✅
- §7 security (env.local, env.example, gitleaks CI + pre-commit, headers, push protection) → Tasks 2, 3, 9 (headers), 11 (push-protection docs) ✅
- §8 data model (ingestion_runs, raw_snapshots) → Task 5 (Phase 0 subset; full compendium tables are Phase 1) ✅
- §9 SEO/AEO (metadata, JSON-LD, sitemap, robots) → Task 9 ✅
- §13 phasing — connection spike proves foundation → Task 8 ✅

**Deferred to the Phase 1 plan (intentional, per spec scope):** compendium entity tables (items/cargo/buildings/resources/creatures/recipes/skills), real subscription queries, MDX content system, `llms.txt`, design-system/branding mockups, community/auth. The Phase 0 spike (Task 8) discovers the real table shapes that Phase 1 ingestion depends on.

**Placeholder scan:** no TBD/TODO/"handle edge cases" left; every code step contains real code. The one explicit unknown (exact SDK builder method names) is bounded to wrapper internals and verified in Task 8 with the public surface locked by a test.

**Type consistency:** `parseServerEnv`/`ServerEnv`, `createDb`/`schema`, `ReadOnlySpacetime` (`connect`/`subscribe`/`disconnect`/`isConnected`), `shouldRunIngestion`/`computeBackoffMs`/`startIngestion` are used consistently across tasks. Package names `@bcc/shared`, `@bcc/web`, `@bcc/worker` match throughout.
```
