# Go-Live / Deployment (design)

**Date:** 2026-06-07 (revised: $0 free-tier + Cloudflare; then slimmed after build-cost re-check)
**Status:** Design / approved by user — proceeding to writing-plans.
**Context:** All feature work is built, tested (182 green), committed to `main` — but **~94 commits are local-only, not pushed** to `origin` (github.com/marts9182/bitcraftCompanion, currently **private**). The site has never been deployed. Goal: take it live **on entirely free tiers**, domain (`bitcraftcompanion.com`) managed at **Cloudflare**. See memory `bitcraft-go-live`, `bitcraft-companion-project`, `bitcraft-companion-security`.

---

## 1. Decisions locked

- ✅ **Cost target: $0** — Vercel Hobby, Neon free, GitHub Actions (free), Cloudflare DNS.
- ✅ **Web host:** **Vercel Hobby**, app = `apps/web` (Root Directory set in the Vercel dashboard). No app-code rework.
- ✅ **Domain:** `bitcraftcompanion.com` stays on **Cloudflare**; DNS records point at Vercel (DNS-only/grey-cloud; Vercel issues SSL).
- ✅ **Repo → public** (gated on a full-history secret scan) → unlimited free GitHub Actions → 30-min worker. *Fallback if kept private: cron every ~3h to fit 2,000 free min/mo.*
- ✅ **Data worker:** GitHub Actions scheduled workflow, cron **every 30 min** (+ `workflow_dispatch`).
- ✅ **DB history pruning:** each snapshot deletes `market_price_history` + `settlement_supply_history` rows **older than 90 days** (keeps Neon under free 0.5 GB; DB is 325 MB now).
- ✅ **Build stays SSG as-is.** Re-check showed the full build is ~21.8k pages in **~7 min** — well under Vercel Hobby's 45-min limit, and builds only run on code pushes (not on snapshots). So the previously-considered calculator-ISR and DB-tolerant-`generateStaticParams` changes are **dropped as unnecessary** (they solved a non-problem and added risk).
- ✅ **CI:** drop the `pnpm build` step (a real build needs the DB, which CI shouldn't hold). CI keeps `typecheck` + `lint` + `test` (+ the gitleaks workflow) — none need a DB. **Vercel is the build gate** (it has `DATABASE_URL`).

## 2. Web hosting (Vercel Hobby, free)

- New Vercel project from the GitHub repo; **Root Directory = `apps/web`** (dashboard setting; Vercel runs the pnpm-workspace install from the repo root automatically). No `vercel.json` required.
- Production env vars (Vercel dashboard): `DATABASE_URL` (Neon), `NEXT_PUBLIC_SITE_URL=https://bitcraftcompanion.com`, `NEXT_PUBLIC_ICON_BASE_URL=/icons`, `REVALIDATE_SECRET`.
- Auto-deploys on push to `main`; ~7-min SSG build is within limits.

## 3. Domain on Cloudflare → Vercel
- Add `bitcraftcompanion.com` (+ `www`) in the Vercel project.
- In **Cloudflare DNS**: apex `A 76.76.21.21` and `www CNAME cname.vercel-dns.com` (or whatever Vercel shows), set **DNS-only (grey cloud)** so Vercel terminates TLS / issues the cert without Cloudflare-proxy conflicts.
- `NEXT_PUBLIC_SITE_URL` already drives canonical URLs, sitemap, metadata.

## 4. Data worker — GitHub Actions cron (free on public repo)
- New `.github/workflows/snapshot.yml`: `on: { schedule: [{ cron: "*/30 * * * *" }], workflow_dispatch: {} }`.
- Steps: checkout → pnpm (v9) + Node 20 → `pnpm install --frozen-lockfile` → `pnpm --filter @bcc/worker leaderboard-snapshot`.
- Env — required by the worker's schema: `DATABASE_URL`, `SPACETIME_URI`, `SPACETIME_MODULE`, `SPACETIME_TOKEN` (all GH **secrets**); plus `INGESTION_ENABLED: "true"` and `REVALIDATE_URL: https://bitcraftcompanion.com/api/revalidate` (literals) and `REVALIDATE_SECRET` (secret). `SPACETIME_GLOBAL_MODULE` has a default (`bitcraft-live-global`); set it as a secret only if it ever differs.
- `concurrency: { group: snapshot, cancel-in-progress: false }` to avoid overlap.
- After a successful snapshot the worker already POSTs `/api/revalidate` (`triggerRevalidate`) → live ISR refresh.
- **Risk (documented):** the SpacetimeDB dev token must work headless and not expire — snapshots fail loudly in the Actions log if it lapses → rotate the secret. GitHub disables schedules after 60 days of repo inactivity (a commit re-arms).

## 5. DB history pruning (stay under Neon free 0.5 GB)
- In `apps/worker/src/leaderboard-snapshot.ts`, immediately after the settlement supply-history append (before the `ingestionRuns` "ok" update), add:
  - `DELETE FROM market_price_history WHERE snapshot_at < now() - interval '90 days'`
  - `DELETE FROM settlement_supply_history WHERE snapshot_at < now() - interval '90 days'`
- Bounds the only unboundedly-growing tables; 90 days is ample trend depth.

## 6. Repo → public (gated)
- **Hard gate before flipping:** `git log --all --full-history -- .env.local "**/.env.local"` returns nothing, and a gitleaks scan over full history is clean. (Secrets have always lived in gitignored `.env.local` per `bitcraft-companion-security`.) If anything is found, scrub history (or stay private + 3h cadence) before going public.
- Then flip the repo to public in GitHub settings (owner action).

## 7. Deliverables
**Code/config (in the plan):**
- Worker 90-day history pruning (`leaderboard-snapshot.ts`).
- `.github/workflows/snapshot.yml`.
- CI: remove the `pnpm build` step from `.github/workflows/ci.yml`.
- `DEPLOY.md` — runbook for the manual steps.

**Manual, owner-only (in `DEPLOY.md`):**
- Run the secret-history scan; if clean, make the repo public.
- Push the local commits to `origin/main`.
- Create the Vercel project (Root Directory `apps/web`) + env vars; first deploy.
- Add `bitcraftcompanion.com` in Vercel + the DNS records in Cloudflare (DNS-only).
- Add the GitHub Actions secrets.
- Trigger the snapshot workflow once via `workflow_dispatch` to confirm ingest + prune + revalidate.

## 8. Testing & verification
- `pnpm typecheck` + `pnpm test` green; `pnpm --filter @bcc/worker typecheck` green (pruning change compiles).
- CI workflow YAML is valid (no `pnpm build` step).
- Post-deploy (owner, per runbook): site loads at `https://bitcraftcompanion.com` in both themes; a manual `workflow_dispatch` snapshot completes (ingest + prune + revalidate) and live pages show current data.

## 9. Out of scope (v1 launch)
Calculator ISR / DB-tolerant params (dropped — non-problem), analytics, error monitoring, preview-deploy gating, redundant worker, history downsampling. Deferrable.

## 10. Build/rollout order (for the plan)
worker 90-day pruning → `snapshot.yml` → CI drop `pnpm build` → `DEPLOY.md` → typecheck/test gate. Then the owner runs the manual secret-scan + go-public + Vercel/Cloudflare/secrets steps. Commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
