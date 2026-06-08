# Go-Live / Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project deployable on $0 free tiers: bound DB growth (90-day history pruning), add a scheduled GitHub Actions data worker, fix CI to not require a DB, and write a deploy runbook — leaving only owner-run infra steps (Vercel, Cloudflare DNS, secrets, go-public).

**Architecture:** Code/config-only. The web app stays exactly as-is (SSG build ~7 min, fine on Vercel Hobby). The worker gains two prune statements. New `snapshot.yml` runs `leaderboard-snapshot` every 30 min on a (public) repo. CI drops `pnpm build` (Vercel is the build gate). A `DEPLOY.md` captures the manual steps.

**Tech Stack:** GitHub Actions, pnpm worker (`@bcc/worker`), drizzle/postgres-js, Vercel Hobby, Neon free, Cloudflare DNS.

**Spec:** `docs/superpowers/specs/2026-06-07-go-live-deployment-design.md`

**Conventions (every commit):**
- Config/docs work: verify via `pnpm --filter @bcc/worker typecheck` (pruning) + YAML validity. No new unit tests (pruning is plain SQL; covered by a live `workflow_dispatch` run in the runbook).
- Commit directly to `main`; keep it green. Messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure
**Create:**
- `.github/workflows/snapshot.yml` — scheduled data-ingest worker (every 30 min + manual).
- `DEPLOY.md` — go-live runbook (owner steps: secret scan, go public, Vercel, Cloudflare DNS, GH secrets).

**Modify:**
- `apps/worker/src/leaderboard-snapshot.ts` — add 90-day history pruning.
- `.github/workflows/ci.yml` — remove the `pnpm build` step.

---

## Task 1: Worker 90-day history pruning

**Files:**
- Modify: `apps/worker/src/leaderboard-snapshot.ts`

- [ ] **Step 1: Add the prune statements**

In `apps/worker/src/leaderboard-snapshot.ts`, find the settlement supply-history block that ends with:
```ts
    const settlementRes = await db.execute(sql`SELECT count(*)::int AS count FROM settlements`);
    const settlementCount = (settlementRes as unknown as { count: number }[])[0]?.count ?? 0;
    console.log(`[lb-snapshot] settlements: ${settlementCount} player settlements + supply-history slice appended`);
```
and immediately AFTER that `console.log(...)` line (before the `db.update(schema.ingestionRuns).set({ status: "ok", ... })` line), insert:
```ts

    // ── Prune trend history older than 90 days (keeps Neon under the free 0.5 GB tier). ──
    await db.execute(sql`DELETE FROM market_price_history WHERE snapshot_at < now() - interval '90 days'`);
    await db.execute(sql`DELETE FROM settlement_supply_history WHERE snapshot_at < now() - interval '90 days'`);
    console.log("[lb-snapshot] pruned price/supply history older than 90 days");
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: no errors. (`db` + `sql` are already in scope in this function.)

```bash
git add apps/worker/src/leaderboard-snapshot.ts
git commit -m "feat(worker): prune price/supply history older than 90 days

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: GitHub Actions snapshot workflow

**Files:**
- Create: `.github/workflows/snapshot.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/snapshot.yml`:
```yaml
name: snapshot
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch: {}

# Never let two snapshots run at once.
concurrency:
  group: snapshot
  cancel-in-progress: false

jobs:
  snapshot:
    runs-on: ubuntu-latest
    timeout-minutes: 20
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
      - name: Run leaderboard snapshot
        run: pnpm --filter @bcc/worker leaderboard-snapshot
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SPACETIME_URI: ${{ secrets.SPACETIME_URI }}
          SPACETIME_MODULE: ${{ secrets.SPACETIME_MODULE }}
          SPACETIME_TOKEN: ${{ secrets.SPACETIME_TOKEN }}
          INGESTION_ENABLED: "true"
          REVALIDATE_URL: https://bitcraftcompanion.com/api/revalidate
          REVALIDATE_SECRET: ${{ secrets.REVALIDATE_SECRET }}
```

(The worker's env schema requires `DATABASE_URL`, `SPACETIME_URI`, `SPACETIME_MODULE`, `SPACETIME_TOKEN`; `SPACETIME_GLOBAL_MODULE` defaults to `bitcraft-live-global` and `INGESTION_ENABLED` defaults true — set explicitly here. `REVALIDATE_URL`/`REVALIDATE_SECRET` enable the post-snapshot ISR refresh. Unlimited free Actions minutes require the repo to be public — see `DEPLOY.md`. `*/30` works on private too but burns the 2,000 free min/mo quickly.)

- [ ] **Step 2: Validate YAML + commit**

Run: `node -e "const fs=require('node:fs');const s=fs.readFileSync('.github/workflows/snapshot.yml','utf8');if(!/cron: \"\*\/30/.test(s)||!/workflow_dispatch/.test(s))throw new Error('snapshot.yml missing schedule/dispatch');console.log('snapshot.yml ok')"`
Expected: `snapshot.yml ok`.

```bash
git add .github/workflows/snapshot.yml
git commit -m "feat(ci): scheduled snapshot worker workflow (every 30 min + manual)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: CI — drop the DB-requiring build step

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Remove the `pnpm build` step**

In `.github/workflows/ci.yml`, delete the final step line:
```yaml
      - run: pnpm build
```
so the steps end at `- run: pnpm test`. (A real Next build needs `DATABASE_URL` to prerender; CI shouldn't hold prod secrets. Vercel is the build gate — it has `DATABASE_URL`. CI keeps typecheck + lint + test, plus the separate gitleaks `secrets.yml` workflow.)

- [ ] **Step 2: Confirm + commit**

Run: `node -e "const s=require('node:fs').readFileSync('.github/workflows/ci.yml','utf8');if(/pnpm build/.test(s))throw new Error('pnpm build still present');console.log('ci build step removed')"`
Expected: `ci build step removed`.

```bash
git add .github/workflows/ci.yml
git commit -m "ci: drop pnpm build step (Vercel is the build gate; CI needs no DB)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `DEPLOY.md` runbook

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: Write the runbook**

Create `DEPLOY.md`:
````markdown
# Deploy / Go-Live Runbook (free tier)

BitCraft Companion runs at **$0**: web on **Vercel Hobby**, DB on **Neon free**, data worker on **GitHub Actions**, domain `bitcraftcompanion.com` on **Cloudflare**. Do these once, in order.

## 0. Pre-flight: secret-history scan (before going public)
Going public exposes ALL git history. Confirm no secret was ever committed.
```bash
git log --all --full-history -- .env.local "**/.env.local"   # must print nothing
```
Also let the existing `secrets.yml` (gitleaks) workflow run clean. If anything is found, scrub it (e.g. `git filter-repo`) or stay private (then change the snapshot cron to `0 */3 * * *` to fit the 2,000 free Actions min/month).

## 1. Make the repo public
GitHub → repo → Settings → General → Danger Zone → Change visibility → Public. (Unlocks unlimited free Actions for the 30-min snapshot.)

## 2. Push the code
```bash
git push origin main
```

## 3. Database — Neon (already live)
The Neon database is already provisioned and populated (~325 MB). Copy its pooled connection string for the env vars below. The worker's 90-day history pruning keeps it under the free 0.5 GB tier.

## 4. Web app — Vercel Hobby
1. Vercel → Add New Project → import `marts9182/bitcraftCompanion`.
2. **Root Directory = `apps/web`** (Settings → General). Framework auto-detects Next.js; install runs from the repo root (pnpm workspace).
3. Environment Variables (Production):
   - `DATABASE_URL` = the Neon connection string
   - `NEXT_PUBLIC_SITE_URL` = `https://bitcraftcompanion.com`
   - `NEXT_PUBLIC_ICON_BASE_URL` = `/icons`
   - `REVALIDATE_SECRET` = a long random string (reuse it in step 6)
4. Deploy. The SSG build takes ~7 min (within Hobby's 45-min limit).

## 5. Domain — Cloudflare → Vercel
1. Vercel project → Settings → Domains → add `bitcraftcompanion.com` and `www.bitcraftcompanion.com`; note the records Vercel shows.
2. Cloudflare → DNS for the zone:
   - `A` `@` → `76.76.21.21` (or the apex value Vercel shows)
   - `CNAME` `www` → `cname.vercel-dns.com`
   - Set both to **DNS only (grey cloud)** so Vercel issues/serves TLS without proxy conflicts.
3. Wait for Vercel to verify + issue the certificate.

## 6. Data worker — GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → New repository secret, add:
- `DATABASE_URL` (same Neon string)
- `SPACETIME_URI` (e.g. `wss://bitcraft-early-access.spacetimedb.com`)
- `SPACETIME_MODULE` (e.g. `bitcraft-live-1`)
- `SPACETIME_TOKEN` (the dev token — must work headless)
- `REVALIDATE_SECRET` (the SAME value as Vercel step 4)

`.github/workflows/snapshot.yml` runs `leaderboard-snapshot` every 30 min and after each run POSTs `/api/revalidate` so the live pages refresh.

## 7. First snapshot (verify end to end)
Repo → Actions → **snapshot** → Run workflow (`workflow_dispatch`). Watch the log for `[lb-snapshot] OK …`, `pruned price/supply history older than 90 days`, and a successful revalidate. Then load `https://bitcraftcompanion.com` and confirm fresh data.

## Maintenance notes
- **Snapshot cadence:** `*/30 * * * *` in `snapshot.yml`. Faster (e.g. 15 min) risks exceeding Neon's free compute budget (~190 h/mo, shared with web traffic) — don't, unless on a paid Neon plan.
- **SpacetimeDB token:** if snapshots start failing with auth errors, the token lapsed — rotate the `SPACETIME_TOKEN` secret.
- **GitHub schedules** auto-disable after 60 days of no repo activity; any commit re-arms them.
- **DB size:** pruning bounds the history tables at 90 days; if Neon nears 0.5 GB, lower the interval in `leaderboard-snapshot.ts` or upgrade Neon.
````

- [ ] **Step 2: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: add go-live deploy runbook (Vercel + Cloudflare + GH Actions worker)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verification

- [ ] **Step 1: Typecheck + tests** — Run: `pnpm typecheck` then `pnpm test`. Expected: all pass (182 tests).
- [ ] **Step 2: Sanity-check the worker still builds** — Run: `pnpm --filter @bcc/worker typecheck`. Expected: no errors (pruning compiles).
- [ ] **Step 3: Confirm workflows are well-formed** — Run: `node -e "for(const f of ['.github/workflows/snapshot.yml','.github/workflows/ci.yml']){require('node:fs').readFileSync(f,'utf8')} console.log('workflows present')"`. Expected: `workflows present`; and re-confirm `ci.yml` has no `pnpm build` and `snapshot.yml` has the `*/30` cron + `workflow_dispatch`.
- [ ] **Step 4: (Owner, post-merge)** Execute `DEPLOY.md` steps 0–7. Success = site live at `https://bitcraftcompanion.com` and a manual `snapshot` run completes (ingest + prune + revalidate) with fresh data on the site.

---

## Spec coverage check
- §1/§5 worker 90-day pruning → Task 1. ✓
- §1/§4 GitHub Actions snapshot workflow (30-min + dispatch, concurrency, required env) → Task 2. ✓
- §1/§7 CI drops `pnpm build` (Vercel build gate) → Task 3. ✓
- §6/§7 secret-scan + go-public + Vercel + Cloudflare DNS + GH secrets + first-snapshot → `DEPLOY.md` (Task 4). ✓
- §1 build stays SSG (no app-code changes) → respected (no calculator/ISR/DB-tolerant tasks). ✓
- §8 verification (typecheck/test/worker-typecheck/workflow validity; owner runbook end-to-end) → Task 5. ✓
- §9 out-of-scope (ISR, analytics, monitoring, downsampling) → not implemented. ✓
