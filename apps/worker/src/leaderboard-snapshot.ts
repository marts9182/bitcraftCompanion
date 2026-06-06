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
const EXPECTED = ["player_username_state", "experience_state", "empire_state"];

const CHUNK = 500;

function moduleList(env: ReturnType<typeof parseServerEnv>): string[] {
  const raw = env.SPACETIME_REGIONS?.trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [env.SPACETIME_MODULE];
}

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
        if (skillRows.length) {
          await inChunks(skillRows, CHUNK, (s) =>
            tx.insert(schema.skills).values(s).onConflictDoUpdate({ target: schema.skills.id, set: conflictUpdateSet(schema.skills, ["id"]) }),
          );
        }
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
