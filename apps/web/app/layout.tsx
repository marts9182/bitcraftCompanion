import type { ReactNode } from "react";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";
import { jsonLdScript } from "@/lib/jsonld";

export const metadata = defaultMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        {children}
      </body>
    </html>
  );
}
