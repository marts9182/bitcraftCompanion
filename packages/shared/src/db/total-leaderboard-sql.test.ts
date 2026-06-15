import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import * as schema from "./schema";

// Regression guard for the "column reference \"total_xp\" is ambiguous" bug.
//
// getTotalLeaderboard() in apps/web/lib/queries/leaderboards.ts joins an
// aggregate subquery (summing player_skills) against the players table. Drizzle
// emits subquery sql`…`.as() columns UNqualified in the outer SELECT/ORDER BY,
// and players has physical total_xp/total_level columns — so a bare "total_xp"
// would bind to both relations and Postgres rejects the query.
//
// This test mirrors that query's shape and asserts the invariant directly: no
// physical players column name may appear as an UNqualified identifier in the
// outer query. Keep the agg/rows construction in sync with leaderboards.ts.

const client = postgres("postgres://user:pass@localhost:5432/db", { prepare: false });
const db = drizzle(client, { schema });
const { players, playerSkills } = schema;

function buildRowsQuery(sort: "totalXp" | "totalLevel" | "highestLevel") {
  const agg = db
    .select({
      playerEntityId: playerSkills.playerEntityId,
      totalXp: sql<number>`sum(${playerSkills.xp})`.as("agg_total_xp"),
      totalLevel: sql<number>`sum(${playerSkills.level})`.as("agg_total_level"),
      highestLevel: sql<number>`max(${playerSkills.level})`.as("agg_highest_level"),
    })
    .from(playerSkills)
    .groupBy(playerSkills.playerEntityId)
    .as("agg");

  const orderCol =
    sort === "totalLevel" ? agg.totalLevel :
    sort === "highestLevel" ? agg.highestLevel :
    agg.totalXp;

  return db
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
    .orderBy(desc(orderCol), agg.playerEntityId);
}

describe("total leaderboard SQL", () => {
  const playerColumnNames = Object.values(getTableColumns(players)).map((c) => c.name);

  it.each(["totalXp", "totalLevel", "highestLevel"] as const)(
    "sort=%s references no unqualified players column (ambiguity guard)",
    (sort) => {
      const { sql: generated } = buildRowsQuery(sort).toSQL();
      for (const col of playerColumnNames) {
        // An unqualified "col" is one NOT preceded by a dot (i.e. not "agg"."col"
        // or "players"."col"). Any such match against a real players column would
        // be ambiguous once the players table is joined.
        const unqualified = new RegExp(`(?<!\\.)"${col}"`);
        expect(generated, `unqualified "${col}" in: ${generated}`).not.toMatch(unqualified);
      }
    },
  );

  it("orders by the aggregate column, not a colliding base-table column", () => {
    expect(buildRowsQuery("totalXp").toSQL().sql).toMatch(/order by "agg_total_xp" desc/);
    expect(buildRowsQuery("totalLevel").toSQL().sql).toMatch(/order by "agg_total_level" desc/);
  });
});
