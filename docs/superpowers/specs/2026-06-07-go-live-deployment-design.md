# Go-Live / Deployment (design)

**Date:** 2026-06-07
**Status:** Design / approved by user — **PAUSED before writing-plans** (resume here next session).
**Context:** All feature work (Phase 4 pillars, settlements, frontend-design foundation, mobile/responsive, header redesign, map fixes) is built, tested (182 green), and committed to `main` — but **~90 commits are local-only, not pushed** to `origin` (github.com/marts9182/bitcraftCompanion, private). The site has never been deployed. This spec covers taking it live: Vercel web hosting, a scheduled data worker, a build-cost fix, and the wiring/runbook. See memory `bitcraft-go-live` and `bitcraft-companion-project`.

---

## 1. Decisions locked

- ✅ **Web host:** **Vercel**, project root = the `apps/web` workspace (pnpm monorepo).
- ✅ **Calculator pages → on-demand ISR** (drop the ~20k all-paths pre-render; ~7-min build otherwise).
- ✅ **Data worker:** **GitHub Actions scheduled workflow**, cron **every 30 minutes** (+ manual `workflow_dispatch`).
- ✅ **Revalidate:** matching `REVALIDATE_SECRET` on Vercel + worker → `/api/revalidate`.
- ✅ **Domain:** `bitcraftcompanion.com` on Vercel.
- ✅ **CI:** keep the existing `pnpm build` gate (fast after ISR).
- ✅ **Calculator first-hit latency** (render-then-cache) is acceptable for launch.

## 2. Web hosting (Vercel)

- New Vercel project from the GitHub repo; monorepo install at repo root (pnpm), app = `apps/web`.
- Production env vars: `DATABASE_URL` (Neon), `NEXT_PUBLIC_SITE_URL=https://bitcraftcompanion.com`, `NEXT_PUBLIC_ICON_BASE_URL=/icons`, `REVALIDATE_SECRET`.
- Auto-deploy on push to `main`.
- A `vercel.json` only if the monorepo build/install commands aren't auto-detected (e.g. `installCommand`/`buildCommand` rooted correctly).

## 3. Build-cost fix — calculator → ISR

- `apps/web/app/calculator/[type]/[slug]/page.tsx`: remove the all-paths `generateStaticParams` (return `[]`, or a small top-N for warmth); keep `dynamicParams = true` and a `revalidate`. Pages render on first request and cache; the sitemap still enumerates them.
- **DB-tolerant `generateStaticParams`:** the other detail routes (items, cargo, buildings, recipes, market, players, settlements) keep their `generateStaticParams`, but each should return `[]` if its DB query throws / `DATABASE_URL` is absent — so CI's `pnpm build` (no prod secrets) succeeds while Vercel's build (with `DATABASE_URL`) still pre-renders them. (`dynamicParams = true` already lets un-prerendered slugs render on demand.)
- Result: build time drops from ~7 min / 21.8k pages to seconds in CI and on Vercel cold builds.

## 4. Data worker — GitHub Actions cron

- New `.github/workflows/snapshot.yml`: `on: { schedule: [{ cron: "*/30 * * * *" }], workflow_dispatch: {} }`.
- Steps: checkout → pnpm setup (v9) + Node 20 → `pnpm install --frozen-lockfile` → `pnpm --filter @bcc/worker leaderboard-snapshot`.
- Env from **GitHub Actions secrets**: `DATABASE_URL`, `SPACETIME_URI`, `SPACETIME_TOKEN`, `SPACETIME_GLOBAL_MODULE`, `INGESTION_ENABLED=true`, `REVALIDATE_URL=https://bitcraftcompanion.com/api/revalidate`, `REVALIDATE_SECRET`.
- `concurrency: { group: snapshot, cancel-in-progress: false }` so runs don't overlap.
- After a successful snapshot the worker already POSTs `/api/revalidate` (via `triggerRevalidate`) → live ISR refresh.
- **Risk (documented, not blocking):** the SpacetimeDB dev token must work headless and not expire; snapshots fail loudly in the Actions log if it lapses → rotate the secret. GitHub disables schedules after 60 days of repo inactivity (a push re-arms).

## 5. Domain + revalidation wiring
- Add `bitcraftcompanion.com` in Vercel; set DNS (A/CNAME per Vercel). `NEXT_PUBLIC_SITE_URL` already drives canonical URLs, sitemap, and metadata.
- Set the SAME `REVALIDATE_SECRET` on Vercel (web) and in GH Actions (worker).

## 6. Deliverables

**Code (in the implementation plan):**
- Calculator → ISR.
- DB-tolerant `generateStaticParams` across the detail routes.
- `.github/workflows/snapshot.yml`.
- `vercel.json` if required by monorepo detection.
- `DEPLOY.md` — the runbook for the manual steps.

**Manual, owner-only (captured in `DEPLOY.md`):**
- Push the ~90 commits to `origin/main`.
- Create the Vercel project + set env vars; first deploy.
- Add the GitHub Actions secrets.
- Configure `bitcraftcompanion.com` DNS in Vercel.
- Trigger the snapshot workflow once via `workflow_dispatch` to confirm ingest + revalidate.

## 7. Testing & verification
- `pnpm typecheck` + `pnpm test` green.
- `pnpm --filter @bcc/web build` green **and demonstrably fast** (proves the ISR change worked) — and succeeds without `DATABASE_URL` (proves the DB-tolerant `generateStaticParams`).
- Post-deploy (owner, per runbook): site loads at `https://bitcraftcompanion.com` in both themes; a manual `workflow_dispatch` snapshot run completes and the live pages refresh with current data.

## 8. Out of scope (v1 launch)
Analytics, error monitoring (Sentry), preview-deploy gating, multi-region/redundant worker, CDN tuning — all deferrable post-launch.

## 9. Build/rollout order (for the plan)
calculator ISR → DB-tolerant generateStaticParams (verify a no-DB `pnpm build` passes) → `snapshot.yml` workflow → `vercel.json` (if needed) → `DEPLOY.md` runbook → typecheck/test/fast-build gate. Then hand off the manual infra steps. Commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
