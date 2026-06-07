import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalculatorResult } from "@/components/calculator/CalculatorResult";
import { getItemBySlug } from "@/lib/queries/items";
import { getCargoBySlug } from "@/lib/queries/cargo";
import { getCalculatorSubgraph, listCraftableTargets } from "@/lib/queries/calculator-graph";
import { refKey, type RefType } from "@/lib/calculator/types";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const targets = await listCraftableTargets();
  return targets.map((t) => ({ type: t.refType, slug: t.slug }));
}

interface Target {
  refType: RefType;
  id: number;
  name: string;
  slug: string;
  icon: string | null;
}

async function loadTarget(type: string, slug: string): Promise<Target | null> {
  if (type === "item") {
    const r = await getItemBySlug(slug);
    return r ? { refType: "item", id: r.id, name: r.name, slug: r.slug, icon: r.iconAssetName } : null;
  }
  if (type === "cargo") {
    const r = await getCargoBySlug(slug);
    return r ? { refType: "cargo", id: r.id, name: r.name, slug: r.slug, icon: r.iconAssetName } : null;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ type: string; slug: string }> }): Promise<Metadata> {
  const { type, slug } = await params;
  const t = await loadTarget(type, slug);
  if (!t) return { title: "Crafting Calculator" };
  return {
    title: `${t.name} — Crafting Calculator`,
    description: `Raw materials, time, and stamina needed to craft ${t.name} in BitCraft Online.`,
    alternates: { canonical: `/calculator/${type}/${slug}` },
    openGraph: { title: `${t.name} — Crafting Calculator`, url: `${SITE_URL}/calculator/${type}/${slug}` },
  };
}

export default async function CalculatorResultPage({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  if (type !== "item" && type !== "cargo") notFound();
  const t = await loadTarget(type, slug);
  if (!t) notFound();

  const subgraph = await getCalculatorSubgraph(t.refType, t.id);
  // Ensure the target resolves even if it has no recipe (raw material).
  const key = refKey(t.refType, t.id);
  subgraph.refInfo[key] ??= { name: t.name, slug: t.slug, iconAssetName: t.icon };

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/calculator" className="hover:underline">
          Calculator
        </Link>{" "}
        / <span>{t.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.name}</h1>
      <p className="mt-1 text-muted-foreground">Crafting calculator</p>
      <CalculatorResult subgraph={subgraph} target={{ refType: t.refType, refId: t.id }} />
    </main>
  );
}
