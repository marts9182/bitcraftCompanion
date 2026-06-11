"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

export interface MemberRow {
  playerEntityId: string;
  username: string | null;
  rank: number;
  noble: boolean;
  donatedShards: number;
  donatedCurrency: number;
}

type Sort = "rank" | "energy" | "name";

function Th({ s, label, align, sort, setSort }: { s: Sort; label: string; align?: "right"; sort: Sort; setSort: (s: Sort) => void }) {
  return (
    <th className={`py-2 pr-3 ${align === "right" ? "text-right" : ""}`}>
      <button type="button" onClick={() => setSort(s)} className={`hover:underline ${sort === s ? "text-foreground font-medium" : ""}`}>
        {label}{sort === s ? " ▾" : ""}
      </button>
    </th>
  );
}

export function EmpireMembers({ members }: { members: MemberRow[] }) {
  const [q, setQ] = useState("");
  const [noblesOnly, setNoblesOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("rank");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = members.filter((m) => (!needle || (m.username ?? "").toLowerCase().includes(needle)) && (!noblesOnly || m.noble));
    r = [...r].sort((a, b) =>
      sort === "energy" ? b.donatedCurrency - a.donatedCurrency :
      sort === "name" ? (a.username ?? "").localeCompare(b.username ?? "") :
      a.rank - b.rank,
    );
    return r;
  }, [members, q, noblesOnly, sort]);

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search members…"
          aria-label="Search members"
          className="h-9 w-56 rounded-md border border-input bg-transparent px-3"
        />
        <label className="inline-flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={noblesOnly} onChange={(e) => setNoblesOnly(e.target.checked)} />
          Nobles only
        </label>
        <span className="text-xs text-muted-foreground">{rows.length.toLocaleString()} of {members.length.toLocaleString()}</span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No members match.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <Th s="rank" label="#" sort={sort} setSort={setSort} />
              <Th s="name" label="Player" sort={sort} setSort={setSort} />
              <Th s="energy" label="Donated energy" align="right" sort={sort} setSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.playerEntityId} className="border-t border-border">
                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">#{m.rank}</td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-2">
                    {m.username ? (
                      <Link href={`/players/${m.playerEntityId}`} className="hover:underline">{m.username}</Link>
                    ) : (
                      <span className="text-muted-foreground">player {m.playerEntityId}</span>
                    )}
                    {m.noble && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">Noble</span>
                    )}
                  </span>
                </td>
                <td className="py-2 text-right font-mono">{m.donatedCurrency.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
