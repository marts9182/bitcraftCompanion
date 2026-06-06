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
  ["/empires", "Empires", "Empires ranked by claims, treasury, and members."],
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
