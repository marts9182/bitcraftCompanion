# On-demand Resource Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve world-map resource spawn dots by querying the live game per region on demand (cached 15 min) instead of hosting 403 MB of static files, so dots are fresh and game-server load stays minimal.

**Architecture:** A Node-runtime route handler `/api/map/resources/[region]/[id]` runs one read-only `SubscribeMulti` query against `bitcraft-live-{region}`, flattens `location_state` rows to a flat `[x,z,…]` small-hex array, grid-bucket-downsamples mega-resources to ≤5,000 points, and returns `{ xz, total, sampled }`. The result is wrapped in `unstable_cache` (revalidate 900 s) so the game is hit at most once per (region, resource) per window. The map client's existing per-region lazy fetch just points at the new route.

**Tech Stack:** Next.js 16 App Router (route handlers, `unstable_cache`), the `ws` package + raw SpacetimeDB v1.json protocol (NOT the `@clockworklabs` SDK — kept out of the web bundle), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-16-on-demand-resource-dots-design.md`

**Conventions:** All commands run from the repo root (`c:/Sandbox/BitcraftCompanion/bitcraftCompanion`). Run a single test file with `pnpm test <path>` (root script is `vitest run`). Vitest includes `apps/**/*.test.ts`, stubs `server-only` and `next/cache`, and aliases `@` → `apps/web`. Every commit message ends with the trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

- Create `apps/web/lib/map/downsample.ts` — pure `gridBucketDownsample(xz, cap)`.
- Create `apps/web/lib/map/downsample.test.ts`.
- Create `apps/web/lib/spacetime/resource-points.ts` — server-only `rowsToXz` (pure) + `fetchResourcePoints` (`ws` query).
- Create `apps/web/lib/spacetime/resource-points.test.ts` — covers `rowsToXz` only.
- Create `apps/web/lib/map/resource-points-service.ts` — `CAP`, pure `packAndDownsample`, cached `getResourcePoints`.
- Create `apps/web/lib/map/resource-points-service.test.ts` — covers `packAndDownsample`.
- Create `apps/web/lib/map/region-params.ts` — `KNOWN_REGIONS`, pure `parseParams`.
- Create `apps/web/lib/map/region-params.test.ts`.
- Create `apps/web/app/api/map/resources/[region]/[id]/route.ts` — `runtime`, `GET`.
- Modify `apps/web/lib/map/use-tracked-points.ts` — swap the resource fetch URL; remove the unused `DATA_BASE`.
- Modify `apps/web/package.json` — add `ws` + `@types/ws`.

`parseParams` lives in its own file (not `route.ts`) because Next route files only permit specific exports (`GET`, `runtime`, …); extra exports break the build.

---

### Task 1: Add the `ws` dependency to the web app

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add `ws` to dependencies and `@types/ws` to devDependencies**

In `apps/web/package.json`, add to the `"dependencies"` block:
```json
    "ws": "^8.18.0",
```
and to the `"devDependencies"` block:
```json
    "@types/ws": "^8.5.12",
```
(Match the versions already used by `apps/worker`.)

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes; `ws` resolves into the web app (workspace dedupes with the worker's copy).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add ws dep for on-demand map queries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Grid-bucket downsampler

**Files:**
- Create: `apps/web/lib/map/downsample.ts`
- Test: `apps/web/lib/map/downsample.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/map/downsample.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gridBucketDownsample } from "@/lib/map/downsample";

describe("gridBucketDownsample", () => {
  it("returns the input unchanged when at or under cap", () => {
    const xz = [0, 0, 10, 10, 20, 20];
    const r = gridBucketDownsample(xz, 5000);
    expect(r.sampled).toBe(false);
    expect(r.xz).toBe(xz); // same reference, not a copy
  });

  it("returns empty unchanged", () => {
    expect(gridBucketDownsample([], 5000)).toEqual({ xz: [], sampled: false });
  });

  it("caps points and preserves spatial spread when over cap", () => {
    // 8 points clustered near the 4 corners of a 0..100 box; cap 4 → ~4 cells.
    const xz = [0, 0, 1, 1, 0, 100, 1, 99, 100, 0, 99, 1, 100, 100, 99, 99];
    const r = gridBucketDownsample(xz, 4);
    expect(r.sampled).toBe(true);
    expect(r.xz.length / 2).toBeLessThanOrEqual(4);
    expect(r.xz.length / 2).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/lib/map/downsample.test.ts`
Expected: FAIL — cannot resolve `@/lib/map/downsample`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/lib/map/downsample.ts`:
```ts
export interface Downsampled {
  xz: number[];
  sampled: boolean;
}

/**
 * Grid-bucket a flat [x,z,x,z,…] small-hex array down to at most ~cap points,
 * keeping one representative per occupied grid cell so the spatial distribution
 * is preserved (far better than uniform stride). Returns the input unchanged
 * (sampled=false) when it already has cap or fewer points. The grid is g×g with
 * g=floor(sqrt(cap)), so the result is at most g*g ≤ cap points.
 */
export function gridBucketDownsample(xz: number[], cap: number): Downsampled {
  const n = Math.floor(xz.length / 2);
  if (n === 0 || n <= cap) return { xz, sampled: false };

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < xz.length; i += 2) {
    const x = xz[i]!, z = xz[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const g = Math.max(1, Math.floor(Math.sqrt(cap)));
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < xz.length; i += 2) {
    const x = xz[i]!, z = xz[i + 1]!;
    const gx = Math.min(g - 1, Math.floor(((x - minX) / spanX) * g));
    const gz = Math.min(g - 1, Math.floor(((z - minZ) / spanZ) * g));
    const cell = gx * g + gz;
    if (seen.has(cell)) continue;
    seen.add(cell);
    out.push(x, z);
  }
  return { xz: out, sampled: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/lib/map/downsample.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/map/downsample.ts apps/web/lib/map/downsample.test.ts
git commit -m "feat(map): grid-bucket downsampler for resource points

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: WS query helper (`rowsToXz` + `fetchResourcePoints`)

**Files:**
- Create: `apps/web/lib/spacetime/resource-points.ts`
- Test: `apps/web/lib/spacetime/resource-points.test.ts`

- [ ] **Step 1: Write the failing test (covers the pure `rowsToXz` only)**

Create `apps/web/lib/spacetime/resource-points.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rowsToXz } from "@/lib/spacetime/resource-points";

describe("rowsToXz", () => {
  it("flattens location rows to [x,z,…] and skips malformed rows", () => {
    const rows = [
      { x: 1, z: 2, entity_id: "9", dimension: 1 },
      { x: 3, z: 4 },
      { foo: 1 }, // no x/z → skipped
      { x: 5, z: null }, // non-number z → skipped
    ];
    expect(rowsToXz(rows)).toEqual([1, 2, 3, 4]);
  });

  it("returns empty for no rows", () => {
    expect(rowsToXz([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/lib/spacetime/resource-points.test.ts`
Expected: FAIL — cannot resolve `@/lib/spacetime/resource-points`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/spacetime/resource-points.ts`:
```ts
import "server-only";
import { gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { extractTableInserts } from "@bcc/shared";

const WS_SUBPROTOCOL = "v1.json.spacetimedb";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

/** Exchange the long-lived dev token for the short-lived WS token. */
async function exchangeToken(httpBase: string, token: string): Promise<string> {
  const res = await fetch(`${httpBase}/v1/identity/websocket-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("Token exchange returned no token");
  return body.token;
}

/** Decode one server frame: 1-byte compression tag (0=none, 2=gzip) or raw JSON. */
function decodeFrame(data: Buffer): string {
  const algo = data[0];
  if (algo === 0) return data.subarray(1).toString("utf8");
  if (algo === 2) return gunzipSync(data.subarray(1)).toString("utf8");
  if (algo === 1) throw new Error("Brotli frame; request compression=None");
  return data.toString("utf8");
}

/** Pure: flatten location_state rows ({x,z,…}) to a flat [x,z,x,z,…] array. */
export function rowsToXz(rows: unknown[]): number[] {
  const xz: number[] = [];
  for (const r of rows) {
    const row = r as { x?: unknown; z?: unknown };
    if (typeof row.x === "number" && typeof row.z === "number") xz.push(row.x, row.z);
  }
  return xz;
}

/**
 * One-shot read-only query for a single resource's spawn positions in one
 * region module. Exchanges the token, opens a v1.json WebSocket, sends one
 * SubscribeMulti (single-resource JOIN — the attributable case), collects
 * location_state rows from the SubscribeMultiApplied frame, closes. Returns a
 * flat [x,z,…] small-hex array. Server-only (uses `ws` + node:zlib); never
 * import this from a client component.
 */
export async function fetchResourcePoints(
  region: number,
  resourceId: number,
  timeoutMs = 8000,
): Promise<number[]> {
  const uri = requireEnv("SPACETIME_URI").replace(/\/+$/, "");
  const token = requireEnv("SPACETIME_TOKEN");
  const httpBase = uri.replace(/^ws/, "http");
  const moduleName = `bitcraft-live-${region}`;
  const tempToken = await exchangeToken(httpBase, token);
  const url =
    `${uri}/v1/database/${moduleName}/subscribe` +
    `?token=${encodeURIComponent(tempToken)}&compression=None`;
  const query =
    `SELECT location_state.* FROM location_state ` +
    `JOIN resource_state ON location_state.entity_id = resource_state.entity_id ` +
    `WHERE resource_state.resource_id = ${resourceId}`;

  return new Promise<number[]>((resolve, reject) => {
    const rows: unknown[] = [];
    let settled = false;
    const ws = new WebSocket(url, [WS_SUBPROTOCOL]);
    ws.binaryType = "arraybuffer";

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => { ws.terminate(); reject(new Error("resource query timeout")); }),
      timeoutMs,
    );

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          SubscribeMulti: { query_strings: [query], request_id: 1, query_id: { id: 1 } },
        }),
      );
    });

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(decodeFrame(Buffer.from(data as ArrayBuffer)));
      } catch {
        return; // non-data frame (e.g. IdentityToken text); ignore
      }
      if (msg && typeof msg === "object" && "SubscriptionError" in msg) {
        finish(() => { ws.close(); reject(new Error("subscription rejected")); });
        return;
      }
      const tables = extractTableInserts(msg);
      const ls = tables.get("location_state");
      if (ls) {
        for (const row of ls) rows.push(row); // loop, not push(...spread): can be 100k+ rows
        finish(() => { ws.close(); resolve(rowsToXz(rows)); });
      }
    });

    ws.on("close", () => finish(() => reject(new Error("WS closed before data"))));
    ws.on("error", (err) => finish(() => reject(err)));
    ws.on("unexpected-response", (_req, res) =>
      finish(() => reject(new Error(`WS upgrade rejected: ${res.statusCode}`))),
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/lib/spacetime/resource-points.test.ts`
Expected: PASS (2 tests). (Importing the module loads `ws` and the stubbed `server-only`; `fetchResourcePoints` is never invoked in the test.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/spacetime/resource-points.ts apps/web/lib/spacetime/resource-points.test.ts
git commit -m "feat(map): server-only single-resource SpacetimeDB query helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Cached service (`packAndDownsample` + `getResourcePoints`)

**Files:**
- Create: `apps/web/lib/map/resource-points-service.ts`
- Test: `apps/web/lib/map/resource-points-service.test.ts`

- [ ] **Step 1: Write the failing test (covers the pure `packAndDownsample`)**

Create `apps/web/lib/map/resource-points-service.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { packAndDownsample } from "@/lib/map/resource-points-service";

describe("packAndDownsample", () => {
  it("passes through unchanged when under cap", () => {
    expect(packAndDownsample([0, 0, 5, 5], 4)).toEqual({
      xz: [0, 0, 5, 5],
      total: 2,
      sampled: false,
    });
  });

  it("preserves the true total and flags sampled when over cap", () => {
    const raw = [0, 0, 1, 1, 0, 100, 1, 99, 100, 0, 99, 1, 100, 100, 99, 99]; // 8 pts
    const r = packAndDownsample(raw, 4);
    expect(r.total).toBe(8); // true count, not the downsampled length
    expect(r.sampled).toBe(true);
    expect(r.xz.length / 2).toBeLessThanOrEqual(4);
  });

  it("handles empty input", () => {
    expect(packAndDownsample([], 4)).toEqual({ xz: [], total: 0, sampled: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/lib/map/resource-points-service.test.ts`
Expected: FAIL — cannot resolve `@/lib/map/resource-points-service`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/map/resource-points-service.ts`:
```ts
import { unstable_cache } from "next/cache";
import { fetchResourcePoints } from "@/lib/spacetime/resource-points";
import { gridBucketDownsample } from "@/lib/map/downsample";

/** Max points returned per (region, resource). Mega-resources are downsampled. */
export const CAP = 5000;

export interface ResourcePoints {
  xz: number[];
  total: number;
  sampled: boolean;
}

/** Pure: record the true point count, then grid-bucket down to <= cap. */
export function packAndDownsample(rawXz: number[], cap = CAP): ResourcePoints {
  const total = Math.floor(rawXz.length / 2);
  const { xz, sampled } = gridBucketDownsample(rawXz, cap);
  return { xz, total, sampled };
}

/**
 * Cached (15 min) per (region, id). On a cache miss, queries the live game and
 * downsamples BEFORE returning, so the cached entry stays small — Next's Data
 * Cache rejects entries over ~2 MB, and a raw mega-resource set is ~50 MB.
 * unstable_cache only stores successful returns, so a failed query is not cached.
 */
export const getResourcePoints = unstable_cache(
  async (region: number, id: number): Promise<ResourcePoints> => {
    const xz = await fetchResourcePoints(region, id);
    return packAndDownsample(xz);
  },
  ["map-resource-points"],
  { revalidate: 900, tags: ["map-resource-points"] },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/lib/map/resource-points-service.test.ts`
Expected: PASS (3 tests). (`next/cache` is stubbed, so importing `getResourcePoints` is harmless; the test only calls `packAndDownsample`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/map/resource-points-service.ts apps/web/lib/map/resource-points-service.test.ts
git commit -m "feat(map): cached resource-points service with downsample-in-cache

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Region/id param validation + route handler

**Files:**
- Create: `apps/web/lib/map/region-params.ts`
- Test: `apps/web/lib/map/region-params.test.ts`
- Create: `apps/web/app/api/map/resources/[region]/[id]/route.ts`

- [ ] **Step 1: Write the failing test for `parseParams`**

Create `apps/web/lib/map/region-params.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseParams } from "@/lib/map/region-params";

describe("parseParams", () => {
  it("accepts a known region and positive id", () => {
    expect(parseParams("7", "23")).toEqual({ ok: true, region: 7, id: 23 });
  });

  it("rejects an unknown region", () => {
    expect(parseParams("5", "23")).toEqual({ ok: false });
  });

  it("rejects a non-numeric region or id", () => {
    expect(parseParams("abc", "23")).toEqual({ ok: false });
    expect(parseParams("7", "x")).toEqual({ ok: false });
  });

  it("rejects a non-positive id", () => {
    expect(parseParams("7", "0")).toEqual({ ok: false });
    expect(parseParams("7", "-3")).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/lib/map/region-params.test.ts`
Expected: FAIL — cannot resolve `@/lib/map/region-params`.

- [ ] **Step 3: Write `region-params.ts`**

Create `apps/web/lib/map/region-params.ts`:
```ts
/** Region modules the game exposes as bitcraft-live-{N}. */
export const KNOWN_REGIONS = new Set([7, 8, 9, 12, 13, 14, 17, 18, 19]);

export type ParseResult = { ok: true; region: number; id: number } | { ok: false };

/** Validate the route's path params. Region must be a known region; id a positive int. */
export function parseParams(regionStr: string, idStr: string): ParseResult {
  const region = Number(regionStr);
  const id = Number(idStr);
  if (!Number.isInteger(region) || !KNOWN_REGIONS.has(region)) return { ok: false };
  if (!Number.isInteger(id) || id <= 0) return { ok: false };
  return { ok: true, region, id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/lib/map/region-params.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the route handler**

Create `apps/web/app/api/map/resources/[region]/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { parseParams } from "@/lib/map/region-params";
import { getResourcePoints } from "@/lib/map/resource-points-service";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ region: string; id: string }> },
) {
  const { region, id } = await ctx.params;
  const parsed = parseParams(region, id);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid region or id" }, { status: 400 });
  }
  try {
    const data = await getResourcePoints(parsed.region, parsed.id);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch {
    // Transient game/WS failure — do NOT cache; the client simply shows no dots.
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
```

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/map/region-params.ts apps/web/lib/map/region-params.test.ts "apps/web/app/api/map/resources/[region]/[id]/route.ts"
git commit -m "feat(map): /api/map/resources/[region]/[id] route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Point the map client at the new route

**Files:**
- Modify: `apps/web/lib/map/use-tracked-points.ts`

- [ ] **Step 1: Swap the resource fetch URL**

In `apps/web/lib/map/use-tracked-points.ts`, change the resource fetch (currently around line 63):
```ts
          fetch(`${DATA_BASE}/resources/r${region}/${t.id}.json`)
```
to:
```ts
          fetch(`/api/map/resources/${region}/${t.id}`)
```
The response still contains `xz`, so the existing `.then((r) => (r.ok ? (r.json() as Promise<{ xz?: number[] }>) : null))` parse is unchanged (extra `total`/`sampled` fields are ignored).

- [ ] **Step 2: Remove the now-unused `DATA_BASE` constant**

Delete these three lines near the top of the same file (currently lines 8–10):
```ts
// Base URL for the static spawn-position files. NEXT_PUBLIC_ vars are inlined
// at build time, so this must be read at module scope in a client file.
const DATA_BASE = process.env.NEXT_PUBLIC_MAP_DATA_BASE ?? "/map-data";
```
(Creatures still fetch `/map/enemies/r${region}.json`, which never used `DATA_BASE`.)

- [ ] **Step 3: Typecheck and lint the web app**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS — no "DATA_BASE is not defined" and no unused-var error.
Run: `pnpm --filter @bcc/web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/map/use-tracked-points.ts
git commit -m "feat(map): fetch resource dots from on-demand route, drop static DATA_BASE

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Environment, full gates, and live verification

**Files:** none (configuration + verification)

- [ ] **Step 1: Ensure the web runtime has the SpacetimeDB env vars (local)**

The route reads `SPACETIME_URI` and `SPACETIME_TOKEN` at request time. Confirm they are available to the Next dev server the same way `DATABASE_URL` already is (the repo's `.env.local` used by the worker holds them; verify the web app loads the same values for local dev). These are server-only — never prefix with `NEXT_PUBLIC_`.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all existing tests plus the new `downsample`, `resource-points`, `resource-points-service`, and `region-params` tests.

- [ ] **Step 3: Typecheck, lint, and production build the web app**

Run: `pnpm --filter @bcc/web typecheck` → PASS
Run: `pnpm --filter @bcc/web lint` → PASS
Run: `pnpm --filter @bcc/web build` → PASS
(The production build is mandatory before declaring deploy-ready — prerender-only failures have slipped past typecheck/test before.)

- [ ] **Step 4: Live end-to-end verification (one query — minimal game impact)**

Start the dev server (`pnpm --filter @bcc/web dev`) and in another shell:
```bash
curl -s "http://localhost:3000/api/map/resources/7/23" | head -c 300
```
Expected: JSON like `{"xz":[...],"total":2997,"sampled":false}` (Ancient Oak, r7 — ~2,997 points, not sampled). A second curl within 15 min returns instantly from cache (no new game query). Then verify a mega-resource is capped:
```bash
curl -s "http://localhost:3000/api/map/resources/17/125" | python -c "import sys,json; d=json.load(sys.stdin); print('total',d['total'],'returned',len(d['xz'])//2,'sampled',d['sampled'])"
```
Expected: `total` ~581078, `returned` ≤ 5000, `sampled True`.

- [ ] **Step 5: Document the production env requirement**

Record (for the owner to action in the Netlify dashboard → Site settings → Environment variables): add `SPACETIME_URI` and `SPACETIME_TOKEN` as server-only env vars. **Do not** put the token in `netlify.toml` (the repo is public). Without these set in prod, the route returns 502 and dots are simply absent — the rest of the site is unaffected.

- [ ] **Step 6: Final verification commit (if any docs/notes changed)**

If Step 5 produced a committed note (e.g. a deploy checklist update), commit it:
```bash
git add -A
git commit -m "docs(map): note Netlify SPACETIME_URI/TOKEN env requirement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Server-only WS helper (no SDK) → Task 1 (`ws` dep) + Task 3.
- Route handler with nodejs runtime + validation → Task 5.
- Client swap to the route, remove `DATA_BASE` → Task 6.
- Downsampling inside the cache boundary → Task 2 (downsampler) + Task 4 (`getResourcePoints` downsamples before returning).
- `{ xz, total, sampled }` response → Task 4 (`packAndDownsample`) + Task 5 (route returns it).
- 15-min cache + `Cache-Control` CDN header → Task 4 (`revalidate: 900`) + Task 5 (header).
- Error path not cached → Task 4 (note) + Task 5 (try/catch → 502).
- Empty result cached normally → covered by `packAndDownsample([])` returning a valid small object (Task 4 test).
- New env (`SPACETIME_URI`/`SPACETIME_TOKEN`) → Task 7 Steps 1 & 5.
- Tests for downsampler, packing (`rowsToXz`), service, validation → Tasks 2, 3, 4, 5. No live-game calls in CI; live path verified manually in Task 7 Step 4.
- Out-of-scope items (creatures, roads, dead static infra, spawnCounts freshness) → untouched by all tasks.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step shows the command and expected result.

**Type consistency:** `gridBucketDownsample(xz, cap) → { xz, sampled }` (Task 2) is consumed by `packAndDownsample` (Task 4). `packAndDownsample(rawXz, cap) → { xz, total, sampled }` (Task 4) matches `ResourcePoints` and the route's returned JSON (Task 5). `fetchResourcePoints(region, id) → number[]` (Task 3) matches its call in `getResourcePoints` (Task 4). `parseParams(regionStr, idStr) → { ok, region, id } | { ok: false }` (Task 5 file) matches its use in the route handler (Task 5 route). `rowsToXz(rows) → number[]` (Task 3) is used inside `fetchResourcePoints` (same file).
