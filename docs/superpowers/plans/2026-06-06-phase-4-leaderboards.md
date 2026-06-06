# Leaderboards + Dynamic-Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Region-scoped BitCraft leaderboards (per-skill, total, empire, activity) on a new dynamic-data ingestion foundation that re-snapshots live player/empire/claim state on a schedule.

**Architecture:** A worker job snapshots dynamic tables from every `bitcraft-live-N` region into new Postgres tables (tagged by region), reusing the existing `ws-snapshot.ts` transport + `COLUMN_ORDERS`/`normalizeRow` + upsert pattern. Pure mappers (shared) unnest XP stacks and compute levels from a game-constant threshold table. The web app renders SSG/ISR leaderboard pages from Postgres with a region switcher, plus on-demand-ISR player/empire detail pages. Pure logic is unit-tested; DB/ingestion is verified by a live snapshot run + production build.

**Tech Stack:** pnpm monorepo, Next.js 16 App Router, React 19, Drizzle ORM (Neon Postgres), `ws`, Vitest. Spec: `docs/superpowers/specs/2026-06-06-phase-4-leaderboards-design.md`.

---

## Conventions (read once)

- **Run all tests** (repo root): `pnpm test`
- **Run one test file:** `pnpm exec vitest run <path>`
- **Typecheck:** `pnpm --filter @bcc/shared typecheck` / `pnpm --filter @bcc/web typecheck` / `pnpm --filter @bcc/worker typecheck`
- **Apply schema to Neon:** `pnpm --filter @bcc/shared db:push` (reads `DATABASE_URL` from root `.env.local`)
- **Web build:** `pnpm --filter @bcc/web build`
- **Web dev:** `pnpm --filter @bcc/web dev` (port 3000; after stopping kill by port: `Get-NetTCPConnection -LocalPort 3000`)
- **Leaderboard snapshot (added in Task 7):** `pnpm --filter @bcc/worker leaderboard-snapshot`
- Entity ids are BitCraft `U64` — they can exceed Postgres `bigint` range, so **store all entity ids as `text` (decimal strings)**. Numeric metrics (xp, level, treasury, counts) use `integer`/`bigint`.
- Shared/pure modules never import `server-only` or `@/lib/db`. Web DB modules start with `import "server-only";`.
- Commit style: `feat(shared|worker|web): …`.

## File Structure

**Stage A — Foundation (`packages/shared`, `apps/worker`):**
- `packages/shared/src/db/schema.ts` — append 7 tables (regions, players, skills, playerSkills, empires, empireMembers, claims).
- `packages/shared/src/ingest/column-orders.ts` — append column orders for the dynamic tables.
- `packages/shared/src/leaderboards/levels.ts` (+ test) — XP→level constant + `levelForXp`.
- `packages/shared/src/ingest/map-leaderboards.ts` (+ test) — pure mappers.
- `packages/shared/src/index.ts` — export the new symbols.
- `packages/shared/src/env.ts` — add `SPACETIME_REGIONS`.
- `apps/worker/src/leaderboard-snapshot.ts` — multi-region snapshot job.
- `apps/worker/package.json` — add the `leaderboard-snapshot` script.

**Stage B — Web (`apps/web`):**
- `apps/web/lib/leaderboards/params.ts` (+ test) — pure region/sort/skill/page param parsing.
- `apps/web/lib/queries/leaderboards.ts` — server DB queries.
- `apps/web/components/leaderboards/RegionSwitcher.tsx` — client region selector.
- `apps/web/app/leaderboards/page.tsx` — hub.
- `apps/web/app/leaderboards/skills/page.tsx` — all-skills grid.
- `apps/web/app/leaderboards/skills/[skill]/page.tsx` — single-skill ranking.
- `apps/web/app/leaderboards/empires/page.tsx` — empire ranking.
- `apps/web/app/leaderboards/activity/page.tsx` — activity.
- `apps/web/app/players/[id]/page.tsx`, `apps/web/app/empires/[id]/page.tsx` — detail.
- Wiring: `layout.tsx` nav, `sitemap.ts`, `llms.txt/route.ts`.

---

# STAGE A — FOUNDATION

## Task 1: Database schema — leaderboard tables

**Files:**
- Modify: `packages/shared/src/db/schema.ts` (append at end, before the `export type` lines)

- [ ] **Step 1: Add the tables**

Append to `packages/shared/src/db/schema.ts`. Note `bigint` and `primaryKey` must be in the import from `drizzle-orm/pg-core` at the top of the file — add them to the existing import list if missing.

```ts
export const regions = pgTable("regions", {
  region: text("region").primaryKey(), // module suffix, e.g. "1", "14"
  module: text("module").notNull(), // e.g. "bitcraft-live-14"
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const players = pgTable(
  "players",
  {
    entityId: text("entity_id").primaryKey(), // U64 as decimal string
    region: text("region").notNull(),
    username: text("username").notNull(),
    timePlayed: integer("time_played").notNull().default(0), // seconds
    signedIn: boolean("signed_in").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byRegion: index("players_region_idx").on(t.region),
    byName: index("players_username_idx").on(t.username),
  }),
);

export const skills = pgTable("skills", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  maxLevel: integer("max_level").notNull().default(0),
});

export const playerSkills = pgTable(
  "player_skills",
  {
    playerEntityId: text("player_entity_id").notNull(),
    skillId: integer("skill_id").notNull(),
    region: text("region").notNull(),
    xp: bigint("xp", { mode: "number" }).notNull().default(0),
    level: integer("level").notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.playerEntityId, t.skillId] }),
    bySkill: index("player_skills_rank_idx").on(t.region, t.skillId, t.xp),
    byPlayer: index("player_skills_player_idx").on(t.playerEntityId),
  }),
);

export const empires = pgTable(
  "empires",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    name: text("name").notNull(),
    numClaims: integer("num_claims").notNull().default(0),
    treasury: bigint("treasury", { mode: "number" }).notNull().default(0),
    leaderPlayerEntityId: text("leader_player_entity_id"),
    memberCount: integer("member_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ byRegion: index("empires_region_idx").on(t.region) }),
);

export const empireMembers = pgTable(
  "empire_members",
  {
    empireEntityId: text("empire_entity_id").notNull(),
    playerEntityId: text("player_entity_id").notNull(),
    region: text("region").notNull(),
    rank: integer("rank").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.empireEntityId, t.playerEntityId] }),
    byEmpire: index("empire_members_empire_idx").on(t.empireEntityId),
    byPlayer: index("empire_members_player_idx").on(t.playerEntityId),
  }),
);

export const claims = pgTable(
  "claims",
  {
    entityId: text("entity_id").primaryKey(),
    region: text("region").notNull(),
    name: text("name").notNull(),
    ownerPlayerEntityId: text("owner_player_entity_id"),
  },
  (t) => ({
    byRegion: index("claims_region_idx").on(t.region),
    byOwner: index("claims_owner_idx").on(t.ownerPlayerEntityId),
  }),
);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: PASS. If `bigint`/`primaryKey` are unresolved, add them to the `drizzle-orm/pg-core` import at the top of the file.

- [ ] **Step 3: Apply to the database**

Run: `pnpm --filter @bcc/shared db:push`
Expected: Drizzle reports the 7 new tables created (interactive prompts answered for new tables; accept creation). If `db:push` is not a script, check `packages/shared/package.json` for the drizzle-kit push command and use that.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/db/schema.ts
git commit -m "feat(shared): leaderboard + dynamic-data tables"
```

---

## Task 2: XP → level conversion

**Files:**
- Create: `packages/shared/src/leaderboards/levels.ts`
- Test: `packages/shared/src/leaderboards/levels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/leaderboards/levels.test.ts
import { describe, it, expect } from "vitest";
import { levelForXp, XP_LEVEL_THRESHOLDS } from "./levels";

describe("levelForXp", () => {
  it("is level 1 at 0 xp and just below the level-2 threshold", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(519)).toBe(1);
  });
  it("crosses to the next level exactly at the threshold", () => {
    expect(levelForXp(520)).toBe(2);
    expect(levelForXp(1100)).toBe(3);
  });
  it("reaches max level 120 at the top threshold and beyond", () => {
    expect(levelForXp(2053471040)).toBe(120);
    expect(levelForXp(9999999999)).toBe(120);
  });
  it("clamps to a skill's maxLevel", () => {
    expect(levelForXp(2053471040, 100)).toBe(100);
  });
  it("has 120 thresholds starting at 0", () => {
    expect(XP_LEVEL_THRESHOLDS.length).toBe(120);
    expect(XP_LEVEL_THRESHOLDS[0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/shared/src/leaderboards/levels.test.ts`
Expected: FAIL ("Cannot find module './levels'").

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/leaderboards/levels.ts
/**
 * Cumulative XP required to REACH each level (index 0 = level 1 = 0 XP, …,
 * index 119 = level 120). BitCraft game constant — same curve for every skill.
 */
export const XP_LEVEL_THRESHOLDS: number[] = [
  0, 520, 1100, 1740, 2460, 3270, 4170, 5170, 6290, 7540, 8930, 10490, 12220, 14160, 16320,
  18730, 21420, 24410, 27760, 31490, 35660, 40310, 45490, 51280, 57740, 64940, 72980, 81940,
  91950, 103110, 115560, 129460, 144960, 162260, 181560, 203100, 227130, 253930, 283840,
  317220, 354450, 396000, 442350, 494070, 551770, 616150, 687980, 768130, 857560, 957330,
  1068650, 1192860, 1331440, 1486060, 1658570, 1851060, 2065820, 2305430, 2572780, 2871080,
  3203890, 3575230, 3989550, 4451810, 4967590, 5543050, 6185120, 6901500, 7700800, 8592610,
  9587630, 10697810, 11936490, 13318540, 14860540, 16581010, 18500600, 20642370, 23032020,
  25698250, 28673070, 31992200, 35695470, 39827360, 44437480, 49581160, 55320170, 61723410,
  68867770, 76839000, 85732810, 95656000, 106727680, 119080790, 132863630, 148241700,
  165399620, 184543380, 205902840, 229734400, 256324240, 285991580, 319092580, 356024680,
  397231240, 443207040, 494504080, 551738200, 615596560, 686845760, 766341360, 855037760,
  953999760, 1064415520, 1187610880, 1325064640, 1478427360, 1649540000, 1840457120, 2053471040,
];

/** Highest level whose cumulative threshold is ≤ xp, clamped to [1, maxLevel]. */
export function levelForXp(xp: number, maxLevel = XP_LEVEL_THRESHOLDS.length): number {
  let level = 1;
  for (let i = 1; i < XP_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= XP_LEVEL_THRESHOLDS[i]!) level = i + 1;
    else break;
  }
  return Math.min(level, maxLevel > 0 ? maxLevel : XP_LEVEL_THRESHOLDS.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/shared/src/leaderboards/levels.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/leaderboards/levels.ts packages/shared/src/leaderboards/levels.test.ts
git commit -m "feat(shared): XP-to-level conversion (BitCraft curve)"
```

---

## Task 3: Column orders for the dynamic tables

**Files:**
- Modify: `packages/shared/src/ingest/column-orders.ts`

The live `v1.json` protocol sends rows as positional arrays; `normalizeRow` keys them using these orders (taken from the resolved schema in `docs/reference/bitcraft-schema.json`).

- [ ] **Step 1: Append the new column orders**

Add these entries inside the `COLUMN_ORDERS` object in `packages/shared/src/ingest/column-orders.ts`:

```ts
  experience_state: ["entity_id", "experience_stacks"],
  skill_desc: ["id", "skill_type", "name", "description", "icon_asset_name", "title", "skill_category", "max_level"],
  player_username_state: ["entity_id", "username"],
  player_state: ["teleport_location", "entity_id", "time_played", "session_start_timestamp", "time_signed_in", "sign_in_timestamp", "signed_in", "traveler_tasks_expiration"],
  signed_in_player_state: ["entity_id"],
  empire_state: ["entity_id", "capital_building_entity_id", "name", "shard_treasury", "nobility_threshold", "num_claims", "location"],
  empire_player_data_state: ["entity_id", "empire_entity_id", "rank", "donated_shards", "noble"],
  claim_state: ["entity_id", "owner_player_entity_id", "owner_building_entity_id", "name", "neutral"],
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/shared typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ingest/column-orders.ts
git commit -m "feat(shared): column orders for dynamic leaderboard tables"
```

---

## Task 4: Pure leaderboard mappers

**Files:**
- Create: `packages/shared/src/ingest/map-leaderboards.ts`
- Test: `packages/shared/src/ingest/map-leaderboards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/ingest/map-leaderboards.test.ts
import { describe, it, expect } from "vitest";
import {
  mapSkillRow,
  mapExperienceRows,
  buildPlayerRows,
  mapEmpireData,
  mapClaimRows,
} from "./map-leaderboards";

describe("mapSkillRow", () => {
  it("maps id/name/maxLevel", () => {
    expect(mapSkillRow({ id: 5, name: "Mining", skill_category: "Profession", max_level: 120 })).toEqual({
      id: 5,
      name: "Mining",
      category: "Profession",
      maxLevel: 120,
    });
  });
});

describe("mapExperienceRows", () => {
  it("unnests positional stacks into per-skill rows with computed level", () => {
    const rows = mapExperienceRows([{ entity_id: "42", experience_stacks: [[5, 520], [6, 0]] }], "1");
    expect(rows).toEqual([
      { playerEntityId: "42", skillId: 5, region: "1", xp: 520, level: 2 },
      { playerEntityId: "42", skillId: 6, region: "1", xp: 0, level: 1 },
    ]);
  });
  it("unnests keyed stacks too and skips stacks with no skill id", () => {
    const rows = mapExperienceRows([{ entity_id: "7", experience_stacks: [{ skill_id: 3, quantity: 1100 }, { quantity: 5 }] }], "2");
    expect(rows).toEqual([{ playerEntityId: "7", skillId: 3, region: "2", xp: 1100, level: 3 }]);
  });
});

describe("buildPlayerRows", () => {
  it("merges username + state + online presence by entity id", () => {
    const rows = buildPlayerRows(
      [{ entity_id: "1", username: "Alice" }, { entity_id: "2", username: "Bob" }],
      [{ entity_id: "1", time_played: 3600, signed_in: true }],
      [{ entity_id: "1" }],
      "1",
    );
    expect(rows).toEqual([
      { entityId: "1", region: "1", username: "Alice", timePlayed: 3600, signedIn: true },
      { entityId: "2", region: "1", username: "Bob", timePlayed: 0, signedIn: false },
    ]);
  });
});

describe("mapEmpireData", () => {
  it("derives member count and leader (lowest rank)", () => {
    const { empires, members } = mapEmpireData(
      [{ entity_id: "100", name: "Vanguard", num_claims: 4, shard_treasury: 999 }],
      [
        { entity_id: "1", empire_entity_id: "100", rank: 2 },
        { entity_id: "2", empire_entity_id: "100", rank: 0 },
      ],
      "1",
    );
    expect(members).toHaveLength(2);
    expect(empires).toEqual([
      {
        entityId: "100",
        region: "1",
        name: "Vanguard",
        numClaims: 4,
        treasury: 999,
        leaderPlayerEntityId: "2",
        memberCount: 2,
      },
    ]);
  });
});

describe("mapClaimRows", () => {
  it("maps claims and nulls out the zero owner", () => {
    expect(mapClaimRows([{ entity_id: "9", name: "Keep", owner_player_entity_id: "0" }], "1")).toEqual([
      { entityId: "9", region: "1", name: "Keep", ownerPlayerEntityId: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/shared/src/ingest/map-leaderboards.test.ts`
Expected: FAIL ("Cannot find module './map-leaderboards'").

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/ingest/map-leaderboards.ts
import { toInt } from "./decode";
import { levelForXp } from "../leaderboards/levels";

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const idStr = (v: unknown): string => (v == null ? "" : String(v));

export interface SkillRow {
  id: number;
  name: string;
  category: string;
  maxLevel: number;
}
export function mapSkillRow(raw: Raw): SkillRow {
  return {
    id: toInt(raw.id)!,
    name: str(raw.name),
    category: str(raw.skill_category),
    maxLevel: toInt(raw.max_level) ?? 0,
  };
}

export interface PlayerSkillRow {
  playerEntityId: string;
  skillId: number;
  region: string;
  xp: number;
  level: number;
}
/** Unnest each player's experience_stacks into one row per skill, with level. */
export function mapExperienceRows(rows: Raw[], region: string, maxLevelBySkill?: Map<number, number>): PlayerSkillRow[] {
  const out: PlayerSkillRow[] = [];
  for (const r of rows) {
    const pid = idStr(r.entity_id);
    const stacks = r.experience_stacks;
    if (!Array.isArray(stacks)) continue;
    for (const s of stacks) {
      let skillId: number | null;
      let xp: number;
      if (Array.isArray(s)) {
        skillId = toInt(s[0]);
        xp = toInt(s[1]) ?? 0;
      } else if (s && typeof s === "object") {
        const o = s as Raw;
        skillId = toInt(o.skill_id);
        xp = toInt(o.quantity) ?? 0;
      } else {
        continue;
      }
      if (skillId == null) continue;
      out.push({ playerEntityId: pid, skillId, region, xp, level: levelForXp(xp, maxLevelBySkill?.get(skillId)) });
    }
  }
  return out;
}

export interface PlayerRow {
  entityId: string;
  region: string;
  username: string;
  timePlayed: number;
  signedIn: boolean;
}
/** Player roster = username rows, enriched with state + online presence. */
export function buildPlayerRows(usernameRows: Raw[], stateRows: Raw[], signedInRows: Raw[], region: string): PlayerRow[] {
  const online = new Set(signedInRows.map((r) => idStr(r.entity_id)));
  const state = new Map(stateRows.map((r) => [idStr(r.entity_id), r] as const));
  return usernameRows.map((u) => {
    const id = idStr(u.entity_id);
    const st = state.get(id);
    return {
      entityId: id,
      region,
      username: str(u.username),
      timePlayed: toInt(st?.time_played) ?? 0,
      signedIn: online.has(id),
    };
  });
}

export interface EmpireRow {
  entityId: string;
  region: string;
  name: string;
  numClaims: number;
  treasury: number;
  leaderPlayerEntityId: string | null;
  memberCount: number;
}
export interface EmpireMemberRow {
  empireEntityId: string;
  playerEntityId: string;
  region: string;
  rank: number;
}
/** Build empire rows + membership; leader = the member with the lowest rank. */
export function mapEmpireData(empireRows: Raw[], memberRows: Raw[], region: string): { empires: EmpireRow[]; members: EmpireMemberRow[] } {
  const members: EmpireMemberRow[] = memberRows.map((m) => ({
    empireEntityId: idStr(m.empire_entity_id),
    playerEntityId: idStr(m.entity_id),
    region,
    rank: toInt(m.rank) ?? 0,
  }));
  const byEmpire = new Map<string, EmpireMemberRow[]>();
  for (const m of members) {
    const arr = byEmpire.get(m.empireEntityId) ?? [];
    arr.push(m);
    byEmpire.set(m.empireEntityId, arr);
  }
  const empires: EmpireRow[] = empireRows.map((e) => {
    const id = idStr(e.entity_id);
    const mem = byEmpire.get(id) ?? [];
    const leader = mem.length ? mem.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
    return {
      entityId: id,
      region,
      name: str(e.name),
      numClaims: toInt(e.num_claims) ?? 0,
      treasury: toInt(e.shard_treasury) ?? 0,
      leaderPlayerEntityId: leader?.playerEntityId ?? null,
      memberCount: mem.length,
    };
  });
  return { empires, members };
}

export interface ClaimRow {
  entityId: string;
  region: string;
  name: string;
  ownerPlayerEntityId: string | null;
}
export function mapClaimRows(rows: Raw[], region: string): ClaimRow[] {
  return rows.map((c) => {
    const owner = idStr(c.owner_player_entity_id);
    return {
      entityId: idStr(c.entity_id),
      region,
      name: str(c.name),
      ownerPlayerEntityId: owner && owner !== "0" ? owner : null,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/shared/src/ingest/map-leaderboards.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ingest/map-leaderboards.ts packages/shared/src/ingest/map-leaderboards.test.ts
git commit -m "feat(shared): pure leaderboard row mappers"
```

---

## Task 5: Export new shared symbols + region env

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/env.ts`

- [ ] **Step 1: Export the new modules**

Append to `packages/shared/src/index.ts`:

```ts
export { levelForXp, XP_LEVEL_THRESHOLDS } from "./leaderboards/levels";
export {
  mapSkillRow,
  mapExperienceRows,
  buildPlayerRows,
  mapEmpireData,
  mapClaimRows,
} from "./ingest/map-leaderboards";
export type { SkillRow, PlayerSkillRow, PlayerRow, EmpireRow, EmpireMemberRow, ClaimRow } from "./ingest/map-leaderboards";
```

- [ ] **Step 2: Add the region list to the env schema**

In `packages/shared/src/env.ts`, add this field inside `serverEnvSchema` (after `SPACETIME_MODULE`):

```ts
  // Comma-separated live region module names for the leaderboard snapshot,
  // e.g. "bitcraft-live-1,bitcraft-live-14". Falls back to SPACETIME_MODULE.
  SPACETIME_REGIONS: z.string().min(1).optional(),
```

- [ ] **Step 3: Typecheck + run full suite**

Run: `pnpm --filter @bcc/shared typecheck && pnpm test`
Expected: typecheck PASS; all tests PASS (including the new levels + map-leaderboards tests).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/env.ts
git commit -m "feat(shared): export leaderboard mappers + SPACETIME_REGIONS env"
```

---

## Task 6: Worker — multi-region leaderboard snapshot

**Files:**
- Create: `apps/worker/src/leaderboard-snapshot.ts`
- Modify: `apps/worker/package.json` (add a script)

No unit test (DB/network job; verified by a live run in Step 4). Models the existing `apps/worker/src/snapshot.ts` (read it first for the env/dotenv bootstrap, `normalizeRow`, chunked upsert, and `conflictUpdateSet` helpers).

- [ ] **Step 1: Add the script**

In `apps/worker/package.json` `scripts`, add:

```json
    "leaderboard-snapshot": "tsx src/leaderboard-snapshot.ts",
```

- [ ] **Step 2: Write the job**

```ts
// apps/worker/src/leaderboard-snapshot.ts
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import {
  parseServerEnv, createDb, schema, COLUMN_ORDERS, normalizeRow,
  mapSkillRow, mapExperienceRows, buildPlayerRows, mapEmpireData, mapClaimRows,
} from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";
import { triggerRevalidate } from "./revalidate";
import { eq, sql, getTableColumns, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

const QUERIES = [
  "SELECT * FROM skill_desc",
  "SELECT * FROM player_username_state",
  "SELECT * FROM player_state",
  "SELECT * FROM signed_in_player_state",
  "SELECT * FROM experience_state",
  "SELECT * FROM empire_state",
  "SELECT * FROM empire_player_data_state",
  "SELECT * FROM claim_state",
];
// skill_desc is global; the others are the per-region dynamic tables. We wait on
// the player/experience/empire tables; skill_desc may legitimately be small.
const EXPECTED = ["player_username_state", "experience_state", "empire_state"];

const CHUNK = 500;

function moduleList(env: ReturnType<typeof parseServerEnv>): string[] {
  const raw = env.SPACETIME_REGIONS?.trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [env.SPACETIME_MODULE];
}

/** "bitcraft-live-14" -> "14"; falls back to the whole module name. */
function regionKey(moduleName: string): string {
  const m = moduleName.match(/(\d+)$/);
  return m ? m[1]! : moduleName;
}

async function inChunks<T>(rows: T[], size: number, fn: (slice: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

function conflictUpdateSet(table: PgTable, skip: string[] = ["entityId", "id"]): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (skip.includes(key)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

async function main() {
  const env = parseServerEnv();
  if (env.INGESTION_ENABLED !== true) {
    console.warn("[lb-snapshot] INGESTION_ENABLED=false — exiting.");
    process.exit(0);
  }
  const db = createDb(env.DATABASE_URL);
  const modules = moduleList(env);
  const [run] = await db.insert(schema.ingestionRuns).values({ status: "running" }).returning();

  try {
    let totalPlayers = 0;
    for (const moduleName of modules) {
      const region = regionKey(moduleName);
      console.log(`[lb-snapshot] region ${region} (${moduleName}) …`);
      const tables = await readSnapshot(
        { uri: env.SPACETIME_URI, moduleName, token: env.SPACETIME_TOKEN },
        QUERIES,
        EXPECTED,
        120_000,
      );
      const norm = (t: string) => (tables.get(t) ?? []).map((r) => normalizeRow(COLUMN_ORDERS[t]!, r));

      const skillRows = norm("skill_desc").map(mapSkillRow);
      const maxBySkill = new Map(skillRows.map((s) => [s.id, s.maxLevel] as const));
      const playerRows = buildPlayerRows(norm("player_username_state"), norm("player_state"), norm("signed_in_player_state"), region);
      const playerSkillRows = mapExperienceRows(norm("experience_state"), region, maxBySkill);
      const { empires, members } = mapEmpireData(norm("empire_state"), norm("empire_player_data_state"), region);
      const claimRows = mapClaimRows(norm("claim_state"), region);
      totalPlayers += playerRows.length;

      await db.transaction(async (tx) => {
        // Skills are global (no region) — upsert.
        if (skillRows.length) {
          await inChunks(skillRows, CHUNK, (s) =>
            tx.insert(schema.skills).values(s).onConflictDoUpdate({ target: schema.skills.id, set: conflictUpdateSet(schema.skills, ["id"]) }),
          );
        }
        // Region-scoped tables: clear this region, then insert fresh (idempotent).
        await tx.delete(schema.playerSkills).where(eq(schema.playerSkills.region, region));
        await tx.delete(schema.empireMembers).where(eq(schema.empireMembers.region, region));
        await tx.delete(schema.claims).where(eq(schema.claims.region, region));
        await inChunks(playerRows, CHUNK, (s) =>
          tx.insert(schema.players).values(s).onConflictDoUpdate({ target: schema.players.entityId, set: conflictUpdateSet(schema.players) }),
        );
        await inChunks(empires, CHUNK, (s) =>
          tx.insert(schema.empires).values(s).onConflictDoUpdate({ target: schema.empires.entityId, set: conflictUpdateSet(schema.empires) }),
        );
        await inChunks(playerSkillRows, CHUNK, (s) => tx.insert(schema.playerSkills).values(s));
        await inChunks(members, CHUNK, (s) => tx.insert(schema.empireMembers).values(s));
        await inChunks(claimRows, CHUNK, (s) => tx.insert(schema.claims).values(s));
        await tx
          .insert(schema.regions)
          .values({ region, module: moduleName, name: `Region ${region}` })
          .onConflictDoUpdate({ target: schema.regions.region, set: { module: moduleName, updatedAt: new Date() } });
      });
      console.log(`[lb-snapshot]   region ${region}: players=${playerRows.length} skills=${playerSkillRows.length} empires=${empires.length} claims=${claimRows.length}`);
    }

    await db.update(schema.ingestionRuns).set({ status: "ok", finishedAt: new Date(), rowsUpserted: totalPlayers }).where(eq(schema.ingestionRuns.id, run!.id));
    await triggerRevalidate({ url: env.REVALIDATE_URL, secret: env.REVALIDATE_SECRET });
    console.log(`[lb-snapshot] OK — ${modules.length} region(s), ${totalPlayers} players`);
    process.exit(0);
  } catch (err) {
    await db.update(schema.ingestionRuns).set({ status: "error", finishedAt: new Date(), error: String(err) }).where(eq(schema.ingestionRuns.id, run!.id));
    console.error("[lb-snapshot] FAILED:", err);
    process.exit(1);
  }
}

main().catch((e) => { console.error("[lb-snapshot] fatal:", e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/worker typecheck`
Expected: PASS. (If `ingestionRuns.error`/`rowsUpserted` columns differ, check `schema.ingestionRuns` and adjust to the actual column names used by `snapshot.ts`.)

- [ ] **Step 4: Live single-region snapshot (verification — needs owner + dev token)**

Set `SPACETIME_MODULE` (or `SPACETIME_REGIONS`) in root `.env.local` to one live module (e.g. `bitcraft-live-1`). Confirm `INGESTION_ENABLED=true`.
Run: `pnpm --filter @bcc/worker leaderboard-snapshot`
Expected: logs `region 1: players=<N> skills=<M> empires=<K> …` and `OK`. **Report the row counts and elapsed time** (this is the data-volume check from the spec's open unknowns). If the subscribe is refused (instant 1006), STOP and report — it's a live-access issue, not a code bug (see `[[spacetimedb-ws-protocol]]`); do not hammer with retries.

If it succeeds, optionally set `SPACETIME_REGIONS` to a few modules and re-run to confirm the multi-region loop. Keep the run to a few regions during verification.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/leaderboard-snapshot.ts apps/worker/package.json
git commit -m "feat(worker): multi-region leaderboard snapshot job"
```

---

# STAGE B — WEB

## Task 7: Pure leaderboard query params

**Files:**
- Create: `apps/web/lib/leaderboards/params.ts`
- Test: `apps/web/lib/leaderboards/params.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/leaderboards/params.test.ts
import { describe, it, expect } from "vitest";
import { parseLeaderboardParams, SKILL_SORTS, LB_PAGE_SIZE } from "./params";

describe("parseLeaderboardParams", () => {
  it("defaults to all regions, totalXp sort, page 1", () => {
    expect(parseLeaderboardParams({})).toEqual({ region: "all", sort: "totalXp", page: 1 });
  });
  it("reads region, a valid sort, and a clamped page", () => {
    expect(parseLeaderboardParams({ region: "14", sort: "totalLevel", page: "3" })).toEqual({
      region: "14",
      sort: "totalLevel",
      page: 3,
    });
  });
  it("falls back to the default sort for an unknown sort and floors page at 1", () => {
    expect(parseLeaderboardParams({ sort: "bogus", page: "0" })).toEqual({ region: "all", sort: "totalXp", page: 1 });
  });
  it("exposes the page size and sort whitelist", () => {
    expect(LB_PAGE_SIZE).toBe(100);
    expect(SKILL_SORTS).toContain("highestLevel");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/lib/leaderboards/params.test.ts`
Expected: FAIL ("Cannot find module './params'").

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/leaderboards/params.ts
export const LB_PAGE_SIZE = 100;
export const SKILL_SORTS = ["totalXp", "totalLevel", "highestLevel"] as const;
export type SkillSort = (typeof SKILL_SORTS)[number];

export interface LeaderboardParams {
  region: string; // "all" or a region key like "14"
  sort: SkillSort;
  page: number;
}

export function parseLeaderboardParams(sp: Record<string, string | string[] | undefined>): LeaderboardParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const region = one(sp.region)?.trim() || "all";
  const sortRaw = one(sp.sort) as SkillSort | undefined;
  const sort = sortRaw && (SKILL_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "totalXp";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { region, sort, page };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/lib/leaderboards/params.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/leaderboards/params.ts apps/web/lib/leaderboards/params.test.ts
git commit -m "feat(web): leaderboard param parsing"
```

---

## Task 8: Leaderboard DB query layer

**Files:**
- Create: `apps/web/lib/queries/leaderboards.ts`

No unit test (DB layer; consistent with the repo). Read `apps/web/lib/queries/items.ts` for the `getDb()`/`schema`/count pattern and `apps/web/lib/db.ts` for `getDb`.

- [ ] **Step 1: Write the query module**

```ts
// apps/web/lib/queries/leaderboards.ts
import "server-only";
import { and, desc, eq, sql, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { LB_PAGE_SIZE, type LeaderboardParams } from "@/lib/leaderboards/params";

const { players, playerSkills, skills, empires, regions } = schema;

export async function listRegions() {
  const db = getDb();
  return db.select().from(regions).orderBy(regions.region);
}

export async function listSkills() {
  const db = getDb();
  return db.select().from(skills).orderBy(skills.name);
}

export interface SkillLeaderRow {
  entityId: string;
  username: string;
  region: string;
  level: number;
  xp: number;
  rank: number;
}

/** Single-skill ranking, paginated. */
export async function getSkillLeaderboard(skillId: number, params: LeaderboardParams): Promise<{ rows: SkillLeaderRow[]; total: number }> {
  const db = getDb();
  const conds = [eq(playerSkills.skillId, skillId)];
  if (params.region !== "all") conds.push(eq(playerSkills.region, params.region));
  const where = and(...conds);

  const [{ total }] = await db.select({ total: count() }).from(playerSkills).where(where);
  const rows = await db
    .select({
      entityId: players.entityId,
      username: players.username,
      region: players.region,
      level: playerSkills.level,
      xp: playerSkills.xp,
    })
    .from(playerSkills)
    .innerJoin(players, eq(players.entityId, playerSkills.playerEntityId))
    .where(where)
    .orderBy(desc(playerSkills.xp))
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);

  const base = (params.page - 1) * LB_PAGE_SIZE;
  return { rows: rows.map((r, i) => ({ ...r, rank: base + i + 1 })), total: Number(total) };
}

export interface TotalLeaderRow {
  entityId: string;
  username: string;
  region: string;
  totalXp: number;
  totalLevel: number;
  highestLevel: number;
  rank: number;
}

/** Total ranking (sum of xp / sum of level / max level) across all skills, paginated. */
export async function getTotalLeaderboard(params: LeaderboardParams): Promise<{ rows: TotalLeaderRow[]; total: number }> {
  const db = getDb();
  const regionWhere = params.region === "all" ? undefined : eq(playerSkills.region, params.region);

  const agg = db
    .select({
      playerEntityId: playerSkills.playerEntityId,
      totalXp: sql<number>`sum(${playerSkills.xp})`.as("total_xp"),
      totalLevel: sql<number>`sum(${playerSkills.level})`.as("total_level"),
      highestLevel: sql<number>`max(${playerSkills.level})`.as("highest_level"),
    })
    .from(playerSkills)
    .where(regionWhere)
    .groupBy(playerSkills.playerEntityId)
    .as("agg");

  // Order by the aggregated subquery columns (NOT the inner table).
  const orderCol =
    params.sort === "totalLevel" ? agg.totalLevel :
    params.sort === "highestLevel" ? agg.highestLevel :
    agg.totalXp;

  const [{ total }] = await db.select({ total: count() }).from(agg);
  const rows = await db
    .select({
      entityId: players.entityId,
      username: players.username,
      region: players.region,
      totalXp: agg.totalXp,
      totalLevel: agg.totalLevel,
      highestLevel: agg.highestLevel,
    })
    .from(agg)
    .innerJoin(players, eq(players.entityId, agg.playerEntityId))
    .orderBy(desc(orderCol))
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);

  const base = (params.page - 1) * LB_PAGE_SIZE;
  return { rows: rows.map((r, i) => ({ ...r, rank: base + i + 1 })), total: Number(total) };
}

export async function getEmpireLeaderboard(params: LeaderboardParams) {
  const db = getDb();
  const where = params.region === "all" ? undefined : eq(empires.region, params.region);
  const orderCol =
    params.sort === "totalLevel" ? empires.treasury :
    params.sort === "highestLevel" ? empires.memberCount :
    empires.numClaims;
  const [{ total }] = await db.select({ total: count() }).from(empires).where(where);
  const rows = await db
    .select()
    .from(empires)
    .where(where)
    .orderBy(desc(orderCol))
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);
  return { rows, total: Number(total) };
}

export async function getActivityLeaderboard(params: LeaderboardParams) {
  const db = getDb();
  const where = params.region === "all" ? undefined : eq(players.region, params.region);
  const [{ total }] = await db.select({ total: count() }).from(players).where(where);
  const [{ online }] = await db
    .select({ online: count() })
    .from(players)
    .where(params.region === "all" ? eq(players.signedIn, true) : and(eq(players.signedIn, true), eq(players.region, params.region)));
  const rows = await db
    .select({ entityId: players.entityId, username: players.username, region: players.region, timePlayed: players.timePlayed, signedIn: players.signedIn })
    .from(players)
    .where(where)
    .orderBy(desc(players.timePlayed))
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);
  return { rows, total: Number(total), online: Number(online) };
}

export async function getPlayer(entityId: string) {
  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.entityId, entityId)).limit(1);
  if (!player) return null;
  const sk = await db
    .select({ skillId: playerSkills.skillId, name: skills.name, level: playerSkills.level, xp: playerSkills.xp })
    .from(playerSkills)
    .innerJoin(skills, eq(skills.id, playerSkills.skillId))
    .where(eq(playerSkills.playerEntityId, entityId))
    .orderBy(desc(playerSkills.xp));
  return { player, skills: sk };
}

export async function getEmpire(entityId: string) {
  const db = getDb();
  const [empire] = await db.select().from(empires).where(eq(empires.entityId, entityId)).limit(1);
  if (!empire) return null;
  const members = await db
    .select({ playerEntityId: schema.empireMembers.playerEntityId, rank: schema.empireMembers.rank, username: players.username })
    .from(schema.empireMembers)
    .leftJoin(players, eq(players.entityId, schema.empireMembers.playerEntityId))
    .where(eq(schema.empireMembers.empireEntityId, entityId))
    .orderBy(schema.empireMembers.rank);
  return { empire, members };
}

export async function listTopPlayerIds(limit = 200): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: players.entityId }).from(players).orderBy(desc(players.timePlayed)).limit(limit);
  return rows.map((r) => r.id);
}

export async function listEmpireIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: empires.entityId }).from(empires);
  return rows.map((r) => r.id);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS. If the Drizzle subquery `.as("agg")` typing or `count()` import causes issues, reconcile against the Drizzle version in `apps/web/package.json` (0.36) — `count` is exported from `drizzle-orm`; the subquery-select pattern is standard. Keep behavior identical.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/queries/leaderboards.ts
git commit -m "feat(web): leaderboard DB queries"
```

---

## Task 9: Region switcher + leaderboard hub

**Files:**
- Create: `apps/web/components/leaderboards/RegionSwitcher.tsx`
- Create: `apps/web/app/leaderboards/page.tsx`

- [ ] **Step 1: Write the RegionSwitcher (client)**

```tsx
// apps/web/components/leaderboards/RegionSwitcher.tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function RegionSwitcher({ regions, current }: { regions: { region: string; name: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function onChange(region: string) {
    const next = new URLSearchParams(sp);
    if (region === "all") next.delete("region");
    else next.set("region", region);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      Region
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Region"
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="all">All regions</option>
        {regions.map((r) => (
          <option key={r.region} value={r.region}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Write the hub page**

```tsx
// apps/web/app/leaderboards/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Leaderboards",
  description: "BitCraft Online player and empire leaderboards — top players by skill, total level, empires, and activity.",
  alternates: { canonical: "/leaderboards" },
};

const CARDS: [string, string, string][] = [
  ["/leaderboards/skills", "Skills", "Top players by skill, total level, and total XP."],
  ["/leaderboards/empires", "Empires", "Empires ranked by claims, treasury, and members."],
  ["/leaderboards/activity", "Activity", "Most-played players and who's online now."],
];

export default function LeaderboardsHub() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Leaderboards</h1>
      <p className="mt-2 text-muted-foreground">Live BitCraft rankings, refreshed continuously and filterable by region.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CARDS.map(([href, title, blurb]) => (
          <Link key={href} href={href} className="rounded-lg border border-border p-5 hover:bg-muted/40">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/leaderboards/RegionSwitcher.tsx apps/web/app/leaderboards/page.tsx
git commit -m "feat(web): leaderboard hub + region switcher"
```

---

## Task 10: Skills leaderboard pages (grid + single-skill)

**Files:**
- Create: `apps/web/app/leaderboards/skills/page.tsx`
- Create: `apps/web/app/leaderboards/skills/[skill]/page.tsx`

- [ ] **Step 1: Write the total/all-skills grid page**

```tsx
// apps/web/app/leaderboards/skills/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE, SKILL_SORTS } from "@/lib/leaderboards/params";
import { getTotalLeaderboard, listRegions, listSkills } from "@/lib/queries/leaderboards";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Skills Leaderboard",
  description: "Top BitCraft Online players ranked by total XP, total level, and per-skill mastery.",
  alternates: { canonical: "/leaderboards/skills" },
};

const SORT_LABEL: Record<(typeof SKILL_SORTS)[number], string> = {
  totalXp: "Total XP",
  totalLevel: "Total Level",
  highestLevel: "Highest Level",
};

export default async function SkillsLeaderboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLeaderboardParams(await searchParams);
  const [{ rows, total }, regions, skills] = await Promise.all([getTotalLeaderboard(params), listRegions(), listSkills()]);
  const totalPages = Math.max(1, Math.ceil(total / LB_PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Skills Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} ranked players · {skills.length} skills</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <RegionSwitcher regions={regions} current={params.region} />
        <div className="flex gap-2 text-sm">
          {SKILL_SORTS.map((s) => {
            const sp = new URLSearchParams();
            if (params.region !== "all") sp.set("region", params.region);
            sp.set("sort", s);
            return (
              <Link
                key={s}
                href={`/leaderboards/skills?${sp.toString()}`}
                className={`rounded-md border px-3 py-1 ${params.sort === s ? "border-primary bg-primary/10" : "border-border"}`}
              >
                {SORT_LABEL[s]}
              </Link>
            );
          })}
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Player</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3 text-right">Highest</th>
            <th className="py-2 pr-3 text-right">Total Level</th>
            <th className="py-2 text-right">Total XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{r.rank}</td>
              <td className="py-2 pr-3">
                <Link href={`/players/${r.entityId}`} className="hover:underline">{r.username}</Link>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{r.region}</td>
              <td className="py-2 pr-3 text-right">{r.highestLevel}</td>
              <td className="py-2 pr-3 text-right">{r.totalLevel}</td>
              <td className="py-2 text-right font-mono">{Number(r.totalXp).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No ranked players yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-6 flex flex-wrap gap-2">
        {skills.map((s) => (
          <Link key={s.id} href={`/leaderboards/skills/${s.id}`} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40">
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <Pager page={params.page} totalPages={totalPages} basePath="/leaderboards/skills" />
      </div>
    </main>
  );
}
```

Note: confirm `Pager`'s prop names by reading `apps/web/components/compendium/Pager.tsx` — it takes `basePath` (added in an earlier phase). If its props differ (e.g. it needs `searchParams` preserved), pass what it expects; the goal is working prev/next that preserves `region`/`sort`.

- [ ] **Step 2: Write the single-skill page**

```tsx
// apps/web/app/leaderboards/skills/[skill]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getSkillLeaderboard, listRegions, listSkills } from "@/lib/queries/leaderboards";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  const skills = await listSkills();
  return skills.map((s) => ({ skill: String(s.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ skill: string }> }): Promise<Metadata> {
  const { skill } = await params;
  const all = await listSkills();
  const s = all.find((x) => String(x.id) === skill);
  if (!s) return { title: "Skill Leaderboard" };
  return {
    title: `${s.name} Leaderboard`,
    description: `Top BitCraft Online players in ${s.name} ranked by XP and level.`,
    alternates: { canonical: `/leaderboards/skills/${skill}` },
  };
}

export default async function SkillLeaderboard({
  params,
  searchParams,
}: {
  params: Promise<{ skill: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { skill } = await params;
  const skillId = Number.parseInt(skill, 10);
  if (!Number.isFinite(skillId)) notFound();
  const lbParams = parseLeaderboardParams(await searchParams);
  const [all, regions, { rows, total }] = await Promise.all([listSkills(), listRegions(), getSkillLeaderboard(skillId, lbParams)]);
  const meta = all.find((s) => s.id === skillId);
  if (!meta) notFound();
  const totalPages = Math.max(1, Math.ceil(total / LB_PAGE_SIZE));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/leaderboards/skills" className="hover:underline">Skills</Link> / <span>{meta.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{meta.name} Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} players</p>
      <div className="mt-6"><RegionSwitcher regions={regions} current={lbParams.region} /></div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Player</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3 text-right">Level</th>
            <th className="py-2 text-right">XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{r.rank}</td>
              <td className="py-2 pr-3"><Link href={`/players/${r.entityId}`} className="hover:underline">{r.username}</Link></td>
              <td className="py-2 pr-3 text-muted-foreground">{r.region}</td>
              <td className="py-2 pr-3 text-right">{r.level}</td>
              <td className="py-2 text-right font-mono">{Number(r.xp).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No players yet.</td></tr>}
        </tbody>
      </table>
      <div className="mt-6"><Pager page={lbParams.page} totalPages={totalPages} basePath={`/leaderboards/skills/${skillId}`} /></div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/leaderboards/skills
git commit -m "feat(web): skills leaderboard grid + per-skill pages"
```

---

## Task 11: Empires + activity leaderboard pages

**Files:**
- Create: `apps/web/app/leaderboards/empires/page.tsx`
- Create: `apps/web/app/leaderboards/activity/page.tsx`

- [ ] **Step 1: Write the empires page**

```tsx
// apps/web/app/leaderboards/empires/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getEmpireLeaderboard, listRegions } from "@/lib/queries/leaderboards";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Empire Leaderboard",
  description: "BitCraft Online empires ranked by claims, treasury, and members.",
  alternates: { canonical: "/leaderboards/empires" },
};

export default async function EmpiresLeaderboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLeaderboardParams(await searchParams);
  const [{ rows, total }, regions] = await Promise.all([getEmpireLeaderboard(params), listRegions()]);
  const totalPages = Math.max(1, Math.ceil(total / LB_PAGE_SIZE));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Empire Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} empires</p>
      <div className="mt-6"><RegionSwitcher regions={regions} current={params.region} /></div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Empire</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3 text-right">Members</th>
            <th className="py-2 pr-3 text-right">Claims</th>
            <th className="py-2 text-right">Treasury</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * LB_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3"><Link href={`/empires/${e.entityId}`} className="hover:underline">{e.name}</Link></td>
              <td className="py-2 pr-3 text-muted-foreground">{e.region}</td>
              <td className="py-2 pr-3 text-right">{e.memberCount}</td>
              <td className="py-2 pr-3 text-right">{e.numClaims}</td>
              <td className="py-2 text-right font-mono">{Number(e.treasury).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No empires yet.</td></tr>}
        </tbody>
      </table>
      <div className="mt-6"><Pager page={params.page} totalPages={totalPages} basePath="/leaderboards/empires" /></div>
    </main>
  );
}
```

- [ ] **Step 2: Write the activity page**

```tsx
// apps/web/app/leaderboards/activity/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getActivityLeaderboard, listRegions } from "@/lib/queries/leaderboards";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Activity Leaderboard",
  description: "Most-played BitCraft Online players and who's online right now.",
  alternates: { canonical: "/leaderboards/activity" },
};

function hours(seconds: number): string {
  return `${Math.round(seconds / 3600).toLocaleString()}h`;
}

export default async function ActivityLeaderboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLeaderboardParams(await searchParams);
  const [{ rows, total, online }, regions] = await Promise.all([getActivityLeaderboard(params), listRegions()]);
  const totalPages = Math.max(1, Math.ceil(total / LB_PAGE_SIZE));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {online.toLocaleString()} online now · {total.toLocaleString()} players
      </p>
      <div className="mt-6"><RegionSwitcher regions={regions} current={params.region} /></div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Player</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 text-right">Time played</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * LB_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3"><Link href={`/players/${r.entityId}`} className="hover:underline">{r.username}</Link></td>
              <td className="py-2 pr-3 text-muted-foreground">{r.region}</td>
              <td className="py-2 pr-3">{r.signedIn ? <span className="text-green-500">● online</span> : <span className="text-muted-foreground">offline</span>}</td>
              <td className="py-2 text-right font-mono">{hours(r.timePlayed)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No players yet.</td></tr>}
        </tbody>
      </table>
      <div className="mt-6"><Pager page={params.page} totalPages={totalPages} basePath="/leaderboards/activity" /></div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/leaderboards/empires apps/web/app/leaderboards/activity
git commit -m "feat(web): empire + activity leaderboard pages"
```

---

## Task 12: Player + empire detail pages (on-demand ISR)

**Files:**
- Create: `apps/web/app/players/[id]/page.tsx`
- Create: `apps/web/app/empires/[id]/page.tsx`

- [ ] **Step 1: Write the player detail page**

```tsx
// apps/web/app/players/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayer, listTopPlayerIds } from "@/lib/queries/leaderboards";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listTopPlayerIds(200);
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getPlayer(id);
  if (!data) return { title: "Player" };
  return {
    title: `${data.player.username} — Player`,
    description: `BitCraft Online player ${data.player.username}: skill levels, total XP, and activity.`,
    alternates: { canonical: `/players/${id}` },
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPlayer(id);
  if (!data) notFound();
  const { player, skills } = data;
  const totalLevel = skills.reduce((a, s) => a + s.level, 0);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{player.username}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Region {player.region} · total level {totalLevel} · {Math.round(player.timePlayed / 3600).toLocaleString()}h played ·{" "}
        {player.signedIn ? <span className="text-green-500">online</span> : "offline"}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Skills</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-2 pr-3">Skill</th><th className="py-2 pr-3 text-right">Level</th><th className="py-2 text-right">XP</th></tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.skillId} className="border-t border-border">
              <td className="py-2 pr-3">
                <Link href={`/leaderboards/skills/${s.skillId}`} className="hover:underline">{s.name}</Link>
              </td>
              <td className="py-2 pr-3 text-right">{s.level}</td>
              <td className="py-2 text-right font-mono">{Number(s.xp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Write the empire detail page**

```tsx
// apps/web/app/empires/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmpire, listEmpireIds } from "@/lib/queries/leaderboards";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listEmpireIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getEmpire(id);
  if (!data) return { title: "Empire" };
  return {
    title: `${data.empire.name} — Empire`,
    description: `BitCraft Online empire ${data.empire.name}: members, claims, and treasury.`,
    alternates: { canonical: `/empires/${id}` },
  };
}

export default async function EmpirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEmpire(id);
  if (!data) notFound();
  const { empire, members } = data;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{empire.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Region {empire.region} · {empire.memberCount} members · {empire.numClaims} claims · treasury {Number(empire.treasury).toLocaleString()}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Members</h2>
      <ul className="mt-3 divide-y divide-border">
        {members.map((m) => (
          <li key={m.playerEntityId} className="flex items-center gap-3 py-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">#{m.rank}</span>
            {m.username ? (
              <Link href={`/players/${m.playerEntityId}`} className="hover:underline">{m.username}</Link>
            ) : (
              <span className="text-muted-foreground">player {m.playerEntityId}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/players apps/web/app/empires
git commit -m "feat(web): player + empire detail pages"
```

---

## Task 13: Wiring + final verification

**Files:**
- Modify: `apps/web/app/layout.tsx` (nav)
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/app/llms.txt/route.ts`

- [ ] **Step 1: Add the nav link**

In `apps/web/app/layout.tsx`, add to the `NAV` array (after the calculator entry, before Blog):

```ts
  ["/leaderboards", "Leaderboards"],
```

- [ ] **Step 2: Add leaderboard URLs to the sitemap**

In `apps/web/app/sitemap.ts`, add the static leaderboard hubs to the returned array (next to the other section hubs):

```ts
    { url: `${SITE_URL}/leaderboards`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/leaderboards/skills`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/leaderboards/empires`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/leaderboards/activity`, lastModified: now, changeFrequency: "hourly", priority: 0.6 },
```

(`changeFrequency` values must be the union Next allows — `"hourly"` is valid. If TypeScript complains, cast with `as const` like the existing entries.)

- [ ] **Step 3: Add a Leaderboards section to llms.txt**

In `apps/web/app/llms.txt/route.ts`, add after the Compendium block:

```
## Leaderboards
- Skills: ${SITE_URL}/leaderboards/skills
- Empires: ${SITE_URL}/leaderboards/empires
- Activity: ${SITE_URL}/leaderboards/activity
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `pnpm -r typecheck && pnpm test`
Expected: all typechecks PASS; all tests PASS (existing 107 + levels 5 + map-leaderboards 6 + params 4 = 122).

- [ ] **Step 5: Production build**

Run: `pnpm --filter @bcc/web build`
Expected: PASS. Leaderboard list pages are static/ISR; `/leaderboards/skills/[skill]` pre-renders one page per skill; `/players/[id]` and `/empires/[id]` pre-render the seed set from `generateStaticParams` and serve the rest on-demand. If the build runs before any leaderboard snapshot has populated the tables, the pages render empty (zero rows) — that is expected and not a failure.

- [ ] **Step 6: Manual smoke test (after a snapshot has run)**

Run: `pnpm --filter @bcc/web dev`, then visit `http://localhost:3000/leaderboards`, click into Skills, switch region, open a player and an empire page. Confirm rows render and links work. Stop the dev server and kill the port (`Get-NetTCPConnection -LocalPort 3000`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/sitemap.ts apps/web/app/llms.txt
git commit -m "feat(web): wire leaderboards into nav, sitemap, llms.txt"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** ingestion foundation (Tasks 1,3,5,6) · level computation (Task 2) · mappers/unnesting (Task 4) · per-skill + total leaderboards (Tasks 8,10) · empire (Tasks 8,11) · activity (Tasks 8,11) · region switcher (Task 9) · player/empire detail on-demand ISR (Task 12) · SEO/sitemap/llms.txt (Tasks 10–13) · multi-region (Task 6 loop + region column throughout).
- **Out of scope (per spec):** 30-day trends, exploration leaderboard, rich profiles, territory-tile counts, continuous streaming, public API.
- **Entity ids** are `text` everywhere (U64-safe). **XP** uses `bigint` mode `"number"` (values stay well under 2^53).
- **Type consistency:** the mapper return types (`SkillRow`, `PlayerSkillRow`, `PlayerRow`, `EmpireRow`, `EmpireMemberRow`, `ClaimRow`) defined in Task 4 are consumed unchanged by the worker (Task 6); the query return shapes (`SkillLeaderRow`, `TotalLeaderRow`) defined in Task 8 are consumed by Tasks 10–11; `parseLeaderboardParams`/`LB_PAGE_SIZE`/`SKILL_SORTS` from Task 7 are used by Tasks 10–11.
- **Live-access risk:** Task 6 Step 4 is the first real dynamic-data pull; if subscribe is refused, it's an access issue (see `[[spacetimedb-ws-protocol]]`), report rather than retry-hammer.
