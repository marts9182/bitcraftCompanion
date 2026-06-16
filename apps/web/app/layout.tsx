import type { ReactNode } from "react";
import { Josefin_Sans, Lexend } from "next/font/google";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";
import { jsonLdScript } from "@/lib/jsonld";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeProvider } from "@/components/ThemeProvider";
import { EventBanner } from "@/components/EventBanner";

export const metadata = defaultMetadata;

const josefin = Josefin_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${josefin.variable} ${lexend.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <ThemeProvider>
          <EventBanner />
          <SiteHeader />
          {children}
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
