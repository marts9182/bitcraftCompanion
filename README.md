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

- The local env file **must be named exactly `.env.local`** — not `.env.locale` or anything else — or it will not be loaded.
- `SPACETIME_TOKEN` is the credential that authenticates the worker against SpacetimeDB. `SPACETIME_IDENTITY` is **optional** (the token already encodes the identity) and is only stored for reference.

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
