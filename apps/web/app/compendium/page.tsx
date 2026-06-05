import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Compendium",
  description: "Browse the BitCraft Online compendium: items, cargo, buildings, and recipes.",
  alternates: { canonical: "/compendium" },
};

const SECTIONS = [
  { href: "/items", title: "Items", desc: "Tools, materials, equipment, and more." },
  { href: "/cargo", title: "Cargo", desc: "Bulky goods and animal bodies." },
  { href: "/buildings", title: "Buildings", desc: "Stations and structures." },
  { href: "/recipes", title: "Recipes", desc: "Crafting and construction recipes." },
];

export default function CompendiumHub() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Compendium", url: `${SITE_URL}/compendium` },
  ]);
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Compendium</h1>
      <p className="mt-2 text-muted-foreground">Everything in BitCraft Online, searchable.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-lg border p-5 hover:bg-muted/40">
            <div className="text-lg font-semibold">{s.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
