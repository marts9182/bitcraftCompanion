import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getHomeStats } from "@/lib/queries/home";
import { getAllPosts } from "@/lib/blog/posts";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "BitCraft Companion — live markets, settlements & maps for BitCraft Online",
  description:
    "The fast, comprehensive companion for BitCraft Online: live market prices, player settlements, empires, an interactive world map, and a crafting calculator.",
  alternates: { canonical: "/" },
};

const FEATURES: { href: string; title: string; desc: string }[] = [
  { href: "/market", title: "Market", desc: "Live order books, prices, and sold volume across every region." },
  { href: "/map", title: "World map", desc: "Interactive map of empires, territories, settlements, and biomes." },
  { href: "/settlements", title: "Settlements", desc: "Player claims ranked by tiles, supplies, and treasury." },
  { href: "/compendium", title: "Compendium", desc: "Every item, cargo, building, recipe, resource, and creature with real game icons." },
  { href: "/calculator", title: "Calculator", desc: "Expand any recipe into a full shopping list of raw materials." },
  { href: "/empires", title: "Empires", desc: "Empire power, treasury, members, and territory at a glance." },
];

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function Home() {
  const stats = await getHomeStats();
  const posts = getAllPosts().slice(0, 3);
  const statItems: [string, number][] = [
    ["Settlements", stats.settlements],
    ["Players", stats.players],
    ["Empires", stats.empires],
    ["Traded items", stats.tradedItems],
  ];

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_70%_0%,color-mix(in_oklch,var(--primary)_18%,var(--background))_0%,var(--background)_55%)]" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 sm:py-32">
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Master the supply economy.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            The fast, comprehensive companion for BitCraft Online — live markets, settlements, empires, an interactive
            world map, and a crafting calculator.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/map" className={buttonVariants({ size: "lg" })}>Explore the map →</Link>
            <Link href="/market" className="text-sm font-medium text-accent-teal hover:underline">Browse the market →</Link>
          </div>
        </div>
      </section>

      {/* Live-stat strip */}
      <section className="border-b border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 sm:grid-cols-4">
          {statItems.map(([label, value]) => (
            <div key={label} className="px-2 py-8 text-center">
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold text-primary sm:text-4xl">
                {value.toLocaleString()}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature tiles */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Everything in BitCraft, in one place
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
            >
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-foreground group-hover:text-primary">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest from the blog */}
      {posts.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Latest guides</h2>
            <Link href="/blog" className="text-sm font-medium text-accent-teal hover:underline">All posts →</Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {posts.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
              >
                <div className="text-xs text-muted-foreground">{fmtDate(p.frontmatter.date)} · {p.readingTime} min</div>
                <h3 className="mt-2 font-semibold text-foreground group-hover:text-primary">{p.frontmatter.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.frontmatter.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
