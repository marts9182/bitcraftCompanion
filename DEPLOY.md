# Deploy / Go-Live Runbook (free tier)

BitCraft Companion runs at **$0**: web on **Netlify (free Starter)**, DB on **Neon free**, data worker on **GitHub Actions**, domain `bitcraftcompanion.com` on **Cloudflare**. Do these once, in order.

> Host note: we chose Netlify over Vercel because Netlify runs on Node, so the app's `postgres-js` → Neon stack works with zero code changes. (Vercel's free signup forced a paid team + its CLI was crashing.) The repo's `apps/web/netlify.toml` is already configured for the pnpm monorepo.

## 0. Pre-flight: secret-history scan (already done / re-verify)
Going public exposes ALL git history. Confirm no secret was ever committed:
```bash
git log --all --full-history -- .env.local "**/.env.local"   # must print nothing
```
`.env.local` is gitignored and was never committed; the `secrets.yml` (gitleaks) workflow gives ongoing coverage.

## 1. Repo is public + pushed
Already done: repo is public, `main` is pushed to `origin`. (Public unlocks unlimited free GitHub Actions for the worker.)

## 2. Database — Neon (already live)
The Neon database is already provisioned and populated (~325 MB). Copy its pooled connection string for the env vars below. The worker's 90-day history pruning keeps it under the free 0.5 GB tier.

## 3. Web app — Netlify (free)
1. Go to **app.netlify.com** → sign up / log in **with GitHub** (no credit card; the free "Starter" tier is default — there's no team/Pro wall).
2. **Add new site → Import an existing project → GitHub** → authorize if asked → pick **`marts9182/bitcraftCompanion`**.
3. On the configure screen (Netlify detects the monorepo + Next.js):
   - **Base directory:** leave **blank / repo root** (so pnpm installs the whole workspace).
   - **Package directory** (a.k.a. the site's directory): **`apps/web`**.
   - Build command + publish are read from `apps/web/netlify.toml` (`pnpm build` → `.next`); the **Next.js plugin** auto-installs. Don't override them.
4. **Environment variables** → add these 4 (Site configuration → Environment variables, or during import under "Add environment variables"):
   - `DATABASE_URL` = the Neon connection string
   - `NEXT_PUBLIC_SITE_URL` = `https://bitcraftcompanion.com`
   - `NEXT_PUBLIC_ICON_BASE_URL` = `/icons`
   - `REVALIDATE_SECRET` = a long random string (reuse it in step 5)
5. **Deploy site.** First build takes ~7–10 min (it pre-renders ~21k pages). When done, open the temporary `*.netlify.app` URL and confirm the site loads.
   - If the build fails, copy the error and we'll fix it (most likely a base/package-directory tweak).

## 4. Domain — Cloudflare → Netlify
1. Netlify site → **Domain management → Add a domain** → `bitcraftcompanion.com`. Netlify shows the DNS target.
2. In **Cloudflare DNS** for the zone (set both **DNS only / grey cloud** so Netlify issues TLS):
   - `A` `@` → **`75.2.60.5`** (Netlify's load balancer)
   - `CNAME` `www` → **`<your-site-name>.netlify.app`** (the name Netlify assigned)
   - (Delete/replace any old apex/www records first.)
3. Back in Netlify, wait for it to verify the domain and provision the Let's Encrypt certificate.

## 5. Data worker — GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → New repository secret, add:
- `DATABASE_URL` (same Neon string)
- `SPACETIME_URI` (e.g. `wss://bitcraft-early-access.spacetimedb.com`)
- `SPACETIME_MODULE` (e.g. `bitcraft-live-1`)
- `SPACETIME_TOKEN` (the dev token — must work headless)
- `REVALIDATE_SECRET` (the SAME value as Netlify step 3)

`.github/workflows/snapshot.yml` runs `leaderboard-snapshot` and after each run POSTs `https://bitcraftcompanion.com/api/revalidate` so the live pages refresh. **The 30-min schedule is currently commented out** (it was failing before secrets existed) — manual runs still work; you re-enable the schedule in step 7.

## 6. First snapshot (verify end to end)
Repo → Actions → **snapshot** → Run workflow (`workflow_dispatch`). Watch the log for `[lb-snapshot] OK …`, `pruned price/supply history older than 90 days`, and a successful revalidate. Then load `https://bitcraftcompanion.com` and confirm fresh data.

## 7. Re-enable the 30-min schedule
Once a manual run succeeds, edit `.github/workflows/snapshot.yml`: uncomment the `schedule:` / `- cron: "*/30 * * * *"` lines, commit, and push. The worker then runs automatically every 30 minutes.

## Maintenance notes
- **Snapshot cadence:** `*/30 * * * *` in `snapshot.yml`. Faster (e.g. 15 min) risks exceeding Neon's free compute budget (~190 h/mo, shared with web traffic) — don't, unless on a paid Neon plan.
- **Netlify free build minutes:** 300/month. The ~7-min build is fine for occasional code pushes; if you redeploy a lot, watch the usage.
- **SpacetimeDB token:** if snapshots start failing with auth errors, the token lapsed — rotate the `SPACETIME_TOKEN` secret.
- **GitHub schedules** auto-disable after 60 days of no repo activity; any commit re-arms them.
- **DB size:** pruning bounds the history tables at 90 days; if Neon nears 0.5 GB, lower the interval in `leaderboard-snapshot.ts` or upgrade Neon.
