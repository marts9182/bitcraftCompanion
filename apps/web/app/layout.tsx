import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";
import { jsonLdScript } from "@/lib/jsonld";

export const metadata = defaultMetadata;

const NAV: [string, string][] = [
  ["/items", "Items"],
  ["/cargo", "Cargo"],
  ["/buildings", "Buildings"],
  ["/recipes", "Recipes"],
  ["/calculator", "Calculator"],
  ["/leaderboards", "Leaderboards"],
  ["/map", "Map"],
  ["/blog", "Blog"],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <header className="border-b">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold">
              BitCraft Companion
            </Link>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
