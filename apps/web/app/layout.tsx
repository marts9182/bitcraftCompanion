import type { ReactNode } from "react";
import { Josefin_Sans } from "next/font/google";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";
import { jsonLdScript } from "@/lib/jsonld";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = defaultMetadata;

const josefin = Josefin_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={josefin.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
