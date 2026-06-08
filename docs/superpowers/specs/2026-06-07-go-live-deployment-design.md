# Go-Live / Deployment (design)

**Date:** 2026-06-07 (revised for $0 / free-tier + Cloudflare domain)
**Status:** Design / approved by user — pending final spec re-review, then writing-plans.
**Context:** All feature work is built, tested (182 green), committed to `main` — but **~91 commits are local-only, not pushed** to `origin` (github.com/marts9182/bitcraftCompanion, currently **private**). The site has never been deployed. Goal: take it live **on entirely free tiers**, with the domain (`bitcraftcompanion.com`) managed at **Cloudflare**. See memory `bitcraft-go-live`, `bitcraft-companion-project`, `bitcraft-companion-security`.

---

## 1. Decisions locked

- ✅ **Cost target: $0** — all free tiers (Vercel Hobby, Neon free, GitHub Actions, Cloudflare DNS).
- ✅ **Web host:** **Vercel Hobby** (free), app = `apps/web`. No code rework (keeps Node + `postgres-js` + Neon).
- ✅ **Domain:** `bitcraftcompanion.com` stays on **Cloudflare**; a DNS record points it at Vercel (Vercel issues SSL).
- ✅ **Repo → public** so GitHub Actions minutes are unlimited (enables the 30-min worker for free) — **gated on a full-history secret scan first**.
- ✅ **Data worker:** **GitHub Actions** scheduled workflow, cron **every 30 minutes** (+ `workflow_dispatch`).
- ✅ **Calculator → on-demand ISR** (drop the ~20k all-paths pre-render; build is ~7 min otherwise).
- ✅ **DB history pruning:** each snapshot deletes `market_price_history` + `settlement_supply_history` rows **older than 90 days**, keeping the DB under Neon's free 0.5 GB (currently 325 MB).
- ✅ **CI:** keep the existing `pnpm build` gate (fast after ISR).
- ✅ Calculator first-hit latency (render-then-cache) acceptable.

*Fallback if repo stays private:* everything identical except the worker cron drops to **every 3 hours** (~240 runs/mo) to fit the 2,000 free Actions min/month.

## 2. Web hosting (Vercel Hobby, free)

- New Vercel project from the GitHub repo; pnpm monorepo (install at repo root), app = `apps/web`.
- Production env vars (Vercel dashboard): `DATABASE_URL` (Neon), `NEXT_PUBLIC_SITE_URL=https://bitcraftcompanion.com`, `NEXT_PUBLIC_ICON_BASE_URL=/icons`, `REVALIDATE_SECRET`.
- Auto-deploy on push to `main`. A `vercel.json` only if monorepo build/install isn't auto-detected.
- Hobby tier is free for non-commercial use; the app's data-heavy pages are ISR/cached so they fit comfortably.

## 3. Domain on Cloudflare → Vercel

- Add `bitcraftcompanion.com` (and `www`) as a domain in the Vercel project.
- In **Cloudflare DNS**, add the records Vercel specifies (apex `A 76.76.21.21` or a `CNAME`/flattened record, and `www CNAME cname.vercel-dns.com`), set to **DNS-only (grey cloud)** to avoid Cloudflare-proxy/Vercel SSL conflicts (Vercel terminates TLS + issues the cert).
- `NEXT_PUBLIC_SITE_URL` already drives canonical URLs, sitemap, and metadata.

## 4. Build-cost fix — calculator → ISR

- `apps/web/app/calculator/[type]/[slug]/page.tsx`: remove the all-paths `generateStaticParams` (return `[]`, or a small top-N for warmth); keep `dynamicParams = true` + a `revalidate`. Sitemap still enumerates them.
- **DB-tolerant `generateStaticParams`:** the other detail routes (items, cargo, buildings, recipes, market, players, settlements) return `[]` if their DB query throws / `DATABASE_URL` is absent — so CI's `pnpm build` (no prod secrets) passes while Vercel's build (with `DATABASE_URL`) still pre-renders them. (`dynamicParams = true` covers the rest on demand.)
- Build time drops from ~7 min / 21.8k pages to seconds.

## 5. Data worker — GitHub Actions cron (free on public repo)

- New `.github/workflows/snapshot.yml`: `on: { schedule: [{ cron: "*/30 * * * *" }], workflow_dispatch: {} }`.
- Steps: checkout → pnpm (v9) + Node 20 → `pnpm install --frozen-lockfile` → `pnpm --filter @bcc/worker leaderboard-snapshot`.
- Env from **GitHub Actions secrets**: `DATABASE_URL`, `SPACETIME_URI`, `SPACETIME_TOKEN`, `SPACETIME_GLOBAL_MODULE`, `INGESTION_ENABLED=true`, `REVALIDATE_URL=https://bitcraftcompanion.com/api/revalidate`, `REVALIDATE_SECRET`.
- `concurrency: { group: snapshot, cancel-in-progress: false }` prevents overlap.
- After a successful snapshot the worker already POSTs `/api/revalidate` (`triggerRevalidate`) → live ISR refresh.
- **Public-repo prerequisite:** GitHub Actions is unlimited on public repos; this is what makes 30-min free.
- **Risk (documented):** the SpacetimeDB dev token must work headless and not expire — snapshots fail loudly in the Actions log if it lapses → rotate the secret. GitHub disables schedules after 60 days of repo inactivity (a commit re-arms).

## 6. DB history pruning (stay under Neon free 0.5 GB)

- In `apps/worker/src/leaderboard-snapshot.ts`, after the history-append steps, add pruning:
  - `DELETE FROM market_price_history WHERE snapshot_at < now() - interval '90 days'`
  - `DELETE FROM settlement_supply_history WHERE snapshot_at < now() - interval '90 days'`
- Bounds the only unboundedly-growing tables; 90 days is ample trend depth for the charts. DB stays ~325 MB + a bounded history slab, under 0.5 GB.

## 7. Repo → public (gated)

- **Hard gate before flipping:** confirm no secret is in git history — `git log --all --full-history -- .env.local "**/.env.local"` returns nothing, and a gitleaks scan over full history is clean. (Secrets have always lived in gitignored `.env.local` per `bitcraft-companion-security`.) If anything is found, scrub history (or stay private + 3h cadence) before going public.
- Then flip the repo to public in GitHub settings (owner action).

## 8. Deliverables

**Code (in the implementation plan):**
- Calculator → ISR.
- DB-tolerant `generateStaticParams` across detail routes.
- History pruning in the worker (90-day).
- `.github/workflows/snapshot.yml`.
- `vercel.json` if required by monorepo detection.
- `DEPLOY.md` — runbook for the manual steps (incl. the pre-public secret scan + Cloudflare DNS records).

**Manual, owner-only (in `DEPLOY.md`):**
- Run the secret-history scan; if clean, make the repo public.
- Push the ~91 commits to `origin/main`.
- Create the Vercel project + env vars; first deploy.
- Add `bitcraftcompanion.com` in Vercel; add the DNS records in Cloudflare (DNS-only).
- Add the GitHub Actions secrets.
- Trigger the snapshot workflow once via `workflow_dispatch` to confirm ingest + revalidate.

## 9. Testing & verification
- `pnpm typecheck` + `pnpm test` green.
- `pnpm --filter @bcc/web build` green, **fast** (proves ISR), and succeeds **without `DATABASE_URL`** (proves DB-tolerant `generateStaticParams`).
- Post-deploy (owner, per runbook): site loads at `https://bitcraftcompanion.com` in both themes; a manual `workflow_dispatch` snapshot completes, prunes, and the live pages refresh.

## 10. Out of scope (v1 launch)
Analytics, error monitoring (Sentry), preview-deploy gating, multi-region/redundant worker, history downsampling (vs simple 90-day delete). Deferrable post-launch.

## 11. Build/rollout order (for the plan)
calculator ISR → DB-tolerant generateStaticParams (verify a no-DB `pnpm build` passes) → worker 90-day history pruning → `snapshot.yml` → `vercel.json` (if needed) → `DEPLOY.md` (incl. secret scan + Cloudflare DNS) → typecheck/test/fast-build gate. Then the owner runs the manual infra + secret-scan + go-public steps. Commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
