import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import {
  parseServerEnv, createDb, schema, COLUMN_ORDERS, normalizeRow,
  mapSkillRow, mapExperienceRows, mapEmpireData, mapClaimRows, mapEmpireNodes, mapClaimMembers,
  usernamesById, onlineEntityIds, activeRegionIds, buildRegionPlayerRows,
  mapClaimLocalRows, mapChunkRows, mapRegionRows, buildEmpireColors, regionNamesById, type MapChunkRow, type MapRegionRow,
} from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";
import { discoverRegionModules } from "./spacetime/discover-regions";
import { triggerRevalidate } from "./revalidate";
import { eq, sql, getTableColumns, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

// GLOBAL module: the player roster (usernames, online presence, player→region map).
const GLOBAL_QUERIES = [
  "SELECT * FROM player_username_state",
  "SELECT * FROM signed_in_player_state",
  "SELECT * FROM user_region_state",
  "SELECT * FROM empire_color_desc",
  "SELECT * FROM empire_emblem_state",
  "SELECT * FROM world_region_name_state",
];
const GLOBAL_EXPECTED = ["player_username_state", "user_region_state"];

// REGION modules: per-region resident data (XP, playtime, empires, claims) + skill defs.
const REGION_QUERIES = [
  "SELECT * FROM skill_desc",
  "SELECT * FROM experience_state",
  "SELECT * FROM player_state",
  "SELECT * FROM empire_state",
  "SELECT * FROM empire_player_data_state",
  "SELECT * FROM empire_node_state",
  "SELECT * FROM claim_state",
  "SELECT * FROM claim_member_state",
  // Map layers:
  "SELECT * FROM claim_local_state",
  "SELECT * FROM empire_chunk_state",
  "SELECT * FROM world_region_state",
];
const REGION_EXPECTED = ["experience_state", "player_state"];

// Grid-only pass for empty (zero-player) regions: just the region grid.
const GRID_QUERIES = ["SELECT * FROM world_region_state"];
const GRID_EXPECTED = ["world_region_state"];
const GRID_TIMEOUT = 20_000;

const CHUNK = 500;

async function inChunks<T>(rows: T[], size: number, fn: (slice: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/**
 * Keep one row per conflict key (last wins). Postgres rejects an ON CONFLICT
 * upsert that would touch the same row twice in one statement, and the live data
 * can carry duplicate keys (e.g. a repeated skill stack), so dedupe before insert.
 */
function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return [...m.values()];
}

function conflictUpdateSet(table: PgTable, skip: string[]): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (skip.includes(key)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

const norm = (tables: Map<string, unknown[]>, t: string) =>
  (tables.get(t) ?? []).map((r) => normalizeRow(COLUMN_ORDERS[t] ?? [], r) as Record<string, unknown>);

async function main() {
  const env = parseServerEnv();
  if (env.INGESTION_ENABLED !== true) {
    console.warn("[lb-snapshot] INGESTION_ENABLED=false — exiting.");
    process.exit(0);
  }
  const db = createDb(env.DATABASE_URL);
  const conn = { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN };
  const [run] = await db.insert(schema.ingestionRuns).values({ status: "running" }).returning();

  try {
    // ── 1. Global pass: roster + online + region map ──────────────────────────
    console.log(`[lb-snapshot] global module ${env.SPACETIME_GLOBAL_MODULE} …`);
    const g = await readSnapshot({ ...conn, moduleName: env.SPACETIME_GLOBAL_MODULE }, GLOBAL_QUERIES, GLOBAL_EXPECTED, 120_000);
    const usernameMap = usernamesById(norm(g, "player_username_state"));
    const onlineSet = onlineEntityIds(norm(g, "signed_in_player_state"));
    const regionList = activeRegionIds(norm(g, "user_region_state"));
    const empireColors = buildEmpireColors(norm(g, "empire_color_desc"), norm(g, "empire_emblem_state"));
    const regionNameMap = regionNamesById(norm(g, "world_region_name_state"));
    console.log(`[lb-snapshot] global: usernames=${usernameMap.size} online=${onlineSet.size} active regions=[${regionList.join(",")}] empireColors=${empireColors.size} regionNames=${regionNameMap.size}`);

    // Active region modules: explicit override, else auto-discovered from user_region_state.
    const modules = env.SPACETIME_REGIONS
      ? env.SPACETIME_REGIONS.split(",").map((s) => s.trim()).filter(Boolean)
      : regionList.map((id) => `bitcraft-live-${id}`);

    // Discover ALL deployed region modules (incl. zero-player ones) via read-only HTTP probe.
    const httpBase = env.SPACETIME_URI.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
    const discovered = await discoverRegionModules(httpBase);
    const emptyModules = discovered.filter((m) => !modules.includes(m));
    console.log(`[lb-snapshot] discovered modules=[${discovered.join(",")}] empty (grid-only)=[${emptyModules.join(",")}]`);

    // ── 2. Per-region pass: XP, playtime, empires, claims ─────────────────────
    let totalPlayers = 0;
    let skillsLoaded = false;
    // empire_chunk_state / world_region_state are replicated across region modules; accumulate
    // (dedup) across the loop and write once after.
    const allChunks = new Map<string, MapChunkRow>();
    const allRegions = new Map<number, MapRegionRow>();
    const allMapClaims = new Map<string, ReturnType<typeof mapClaimLocalRows>[number]>();
    for (const moduleName of modules) {
      const region = (moduleName.match(/(\d+)$/)?.[1]) ?? moduleName;
      console.log(`[lb-snapshot] region ${region} (${moduleName}) …`);
      const r = await readSnapshot({ ...conn, moduleName }, REGION_QUERIES, REGION_EXPECTED, 120_000);

      const skillRows = dedupeBy(norm(r, "skill_desc").map(mapSkillRow), (s) => String(s.id));
      const maxBySkill = new Map(skillRows.map((s) => [s.id, s.maxLevel] as const));
      const playerSkillRows = dedupeBy(mapExperienceRows(norm(r, "experience_state"), region, maxBySkill), (s) => `${s.playerEntityId}:${s.skillId}`);
      // Materialize per-player skill totals (excluding skill_id 1 = the "ANY" sentinel).
      const skillTotals = new Map<string, { level: number; xp: number }>();
      for (const s of playerSkillRows) {
        if (s.skillId === 1) continue;
        const t = skillTotals.get(s.playerEntityId) ?? { level: 0, xp: 0 };
        t.level += s.level; t.xp += s.xp;
        skillTotals.set(s.playerEntityId, t);
      }
      const playerRows = dedupeBy(
        buildRegionPlayerRows(norm(r, "player_state"), region, usernameMap, onlineSet).map((p) => ({
          ...p, totalLevel: skillTotals.get(p.entityId)?.level ?? 0, totalXp: skillTotals.get(p.entityId)?.xp ?? 0,
        })),
        (p) => p.entityId,
      );
      const raw = mapEmpireData(norm(r, "empire_state"), norm(r, "empire_player_data_state"), region);
      const { towers, agg } = mapEmpireNodes(norm(r, "empire_node_state"), region);
      const empires = dedupeBy(raw.empires, (e) => e.entityId).map((e) => {
        const a = agg.get(e.entityId);
        return { ...e, color: empireColors.get(e.entityId) ?? null, towerCount: a?.count ?? 0, towerEnergy: a?.energy ?? 0, towerUpkeep: a?.upkeep ?? 0 };
      });
      const members = dedupeBy(raw.members, (m) => `${m.empireEntityId}:${m.playerEntityId}`);
      const towerRows = dedupeBy(towers, (t) => t.entityId);
      const claimRows = dedupeBy(mapClaimRows(norm(r, "claim_state"), region), (c) => c.entityId);
      totalPlayers += playerRows.length;

      // Map layers: claims (per-region, with names from claim_state), chunks + regions (replicated).
      const claimNameMap = new Map(norm(r, "claim_state").map((c) => [String(c.entity_id), String(c.name ?? "")] as const));
      const claimMemberRows = dedupeBy(mapClaimMembers(norm(r, "claim_member_state"), region, claimNameMap), (m) => `${m.claimEntityId}:${m.playerEntityId}`);
      const mapClaimData = dedupeBy(mapClaimLocalRows(norm(r, "claim_local_state"), claimNameMap), (c) => c.entityId);
      for (const c of mapClaimData) allMapClaims.set(c.entityId, c);
      for (const c of mapChunkRows(norm(r, "empire_chunk_state"))) allChunks.set(c.chunkIndex, c);
      for (const g of mapRegionRows(norm(r, "world_region_state"), new Map())) {
        // Each module reports its OWN region; key by the global region number (module suffix),
        // not the local world_region_state.id (which is 0 per module). Name from the global map.
        allRegions.set(Number(region), { ...g, id: Number(region), name: regionNameMap.get(g.regionIndex) ?? regionNameMap.get(Number(region)) ?? `Region ${region}` });
      }

      await db.transaction(async (tx) => {
        if (skillRows.length) {
          await inChunks(skillRows, CHUNK, (s) =>
            tx.insert(schema.skills).values(s).onConflictDoUpdate({ target: schema.skills.id, set: conflictUpdateSet(schema.skills, ["id"]) }),
          );
          skillsLoaded = true;
        }
        // Clear this region's rows first so departed entities don't linger.
        await tx.delete(schema.playerSkills).where(eq(schema.playerSkills.region, region));
        await tx.delete(schema.empireMembers).where(eq(schema.empireMembers.region, region));
        await tx.delete(schema.empireTowers).where(eq(schema.empireTowers.region, region));
        await tx.delete(schema.claimMembers).where(eq(schema.claimMembers.region, region));
        await tx.delete(schema.claims).where(eq(schema.claims.region, region));
        await tx.delete(schema.players).where(eq(schema.players.region, region));
        await tx.delete(schema.empires).where(eq(schema.empires.region, region));
        await inChunks(playerRows, CHUNK, (s) =>
          tx.insert(schema.players).values(s).onConflictDoUpdate({ target: schema.players.entityId, set: conflictUpdateSet(schema.players, ["entityId"]) }),
        );
        await inChunks(empires, CHUNK, (s) =>
          tx.insert(schema.empires).values(s).onConflictDoUpdate({ target: schema.empires.entityId, set: conflictUpdateSet(schema.empires, ["entityId"]) }),
        );
        await inChunks(playerSkillRows, CHUNK, (s) =>
          tx.insert(schema.playerSkills).values(s).onConflictDoUpdate({
            target: [schema.playerSkills.playerEntityId, schema.playerSkills.skillId],
            set: conflictUpdateSet(schema.playerSkills, ["playerEntityId", "skillId"]),
          }),
        );
        await inChunks(members, CHUNK, (s) =>
          tx.insert(schema.empireMembers).values(s).onConflictDoUpdate({
            target: [schema.empireMembers.empireEntityId, schema.empireMembers.playerEntityId],
            set: conflictUpdateSet(schema.empireMembers, ["empireEntityId", "playerEntityId"]),
          }),
        );
        await inChunks(claimRows, CHUNK, (s) =>
          tx.insert(schema.claims).values(s).onConflictDoUpdate({ target: schema.claims.entityId, set: conflictUpdateSet(schema.claims, ["entityId"]) }),
        );
        await inChunks(towerRows, CHUNK, (s) =>
          tx.insert(schema.empireTowers).values(s).onConflictDoUpdate({ target: schema.empireTowers.entityId, set: conflictUpdateSet(schema.empireTowers, ["entityId"]) }),
        );
        await inChunks(claimMemberRows, CHUNK, (s) =>
          tx.insert(schema.claimMembers).values(s).onConflictDoUpdate({
            target: [schema.claimMembers.claimEntityId, schema.claimMembers.playerEntityId],
            set: conflictUpdateSet(schema.claimMembers, ["claimEntityId", "playerEntityId"]),
          }),
        );
        await tx
          .insert(schema.regions)
          .values({ region, module: moduleName, name: `Region ${region}` })
          .onConflictDoUpdate({ target: schema.regions.region, set: { module: moduleName, updatedAt: new Date() } });
      });
      console.log(`[lb-snapshot]   region ${region}: players=${playerRows.length} skills=${playerSkillRows.length} empires=${empires.length} claims=${claimRows.length} mapClaims=${mapClaimData.length}`);
    }

    // ── 2b. Roster fill: every player in the GLOBAL username roster that isn't a
    // resident of an ingested region (region "") so the players list is complete
    // (e.g. claim co-owners who live in a region we don't snapshot). Residents were
    // already inserted with real stats above; onConflictDoNothing keeps those.
    const rosterRows = [...usernameMap.entries()].map(([id, username]) => ({
      entityId: id, username, region: "", timePlayed: 0, timeSignedIn: 0, signInTimestamp: 0,
      signedIn: onlineSet.has(id), totalLevel: 0, totalXp: 0,
    }));
    await db.transaction(async (tx) => {
      // Clear last run's roster-only rows (region "") so departed/renamed players
      // don't linger, then (re)insert; residents keep their real region/stats.
      await tx.delete(schema.players).where(eq(schema.players.region, ""));
      await inChunks(rosterRows, CHUNK, (s) => tx.insert(schema.players).values(s).onConflictDoNothing({ target: schema.players.entityId }));
    });
    console.log(`[lb-snapshot] roster fill: ${rosterRows.length} roster players (non-residents inserted with region="")`);

    // ── 3. Grid-only pass for empty (zero-player) regions ─────────────────────
    // These modules have a world_region_state grid but no residents. Subscribe
    // SEQUENTIALLY (one WS at a time) and tolerate failures: a module with no
    // grid (or that refuses) rejects — log and skip, never fail the snapshot.
    let emptyGridded = 0;
    for (const moduleName of emptyModules) {
      const region = (moduleName.match(/(\d+)$/)?.[1]) ?? moduleName;
      try {
        const r = await readSnapshot({ ...conn, moduleName }, GRID_QUERIES, GRID_EXPECTED, GRID_TIMEOUT);
        let folded = 0;
        for (const grid of mapRegionRows(norm(r, "world_region_state"), new Map())) {
          allRegions.set(Number(region), {
            ...grid,
            id: Number(region),
            name: regionNameMap.get(grid.regionIndex) ?? regionNameMap.get(Number(region)) ?? `Region ${region}`,
          });
          folded++;
        }
        if (folded) {
          await db
            .insert(schema.regions)
            .values({ region, module: moduleName, name: regionNameMap.get(Number(region)) ?? `Region ${region}` })
            .onConflictDoUpdate({ target: schema.regions.region, set: { module: moduleName, updatedAt: new Date() } });
          emptyGridded++;
        }
        console.log(`[lb-snapshot]   empty region ${region} (${moduleName}): grid rows=${folded}`);
      } catch (err) {
        console.warn(`[lb-snapshot]   empty region ${region} (${moduleName}) skipped:`, String(err));
      }
    }

    // Map chunks + regions: write once (replicated data accumulated across the loop).
    const chunkRows = [...allChunks.values()];
    await db.transaction(async (tx) => {
      await tx.delete(schema.mapChunks); // full replace: empire_chunk_state is the complete current set
      await inChunks(chunkRows, CHUNK, (s) => tx.insert(schema.mapChunks).values(s));
      await tx.delete(schema.mapClaims); // full replace too (no region column to scope a per-region delete)
      await inChunks([...allMapClaims.values()], CHUNK, (s) => tx.insert(schema.mapClaims).values(s));
      for (const g of allRegions.values()) {
        await tx.insert(schema.mapRegions).values(g).onConflictDoUpdate({ target: schema.mapRegions.id, set: conflictUpdateSet(schema.mapRegions, ["id"]) });
      }
    });
    console.log(`[lb-snapshot] map: chunks=${chunkRows.length} regions=${allRegions.size}`);

    await db.update(schema.ingestionRuns).set({ status: "ok", finishedAt: new Date(), rowsUpserted: totalPlayers }).where(eq(schema.ingestionRuns.id, run!.id));
    await triggerRevalidate({ url: env.REVALIDATE_URL, secret: env.REVALIDATE_SECRET });
    console.log(`[lb-snapshot] OK — ${modules.length} player region(s) + ${emptyGridded}/${emptyModules.length} empty region(s) gridded (${discovered.length} discovered), ${totalPlayers} players${skillsLoaded ? "" : " (no skill_desc seen)"}`);
    process.exit(0);
  } catch (err) {
    await db.update(schema.ingestionRuns).set({ status: "error", finishedAt: new Date(), error: String(err) }).where(eq(schema.ingestionRuns.id, run!.id));
    console.error("[lb-snapshot] FAILED:", err);
    process.exit(1);
  }
}

main().catch((e) => { console.error("[lb-snapshot] fatal:", e); process.exit(1); });
