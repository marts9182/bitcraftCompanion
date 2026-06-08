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
