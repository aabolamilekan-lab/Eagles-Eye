import type { Metadata } from "next";
import { Newsreader, Archivo } from "next/font/google";
import { absoluteUrl, siteBaseUrl } from "@/lib/seo/canonical";
import { siteDescription, siteName } from "@/lib/seo/metadata";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/open-graph";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/lib/seo/cover-url";
import "./globals.css";

/*
 * Two families, both variable.
 *
 * Newsreader carries display, headings and all reading prose. It has a real
 * optical-size axis, so one file serves the 19px reading cut and the 3.5rem
 * display cut without a second download.
 *
 * Archivo carries UI chrome: navigation, labels, buttons, table cells, admin.
 * Mono is a system stack, so no third download.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  axes: ["opsz"],
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  // Validated once, here. In production a missing or malformed
  // NEXT_PUBLIC_APP_URL throws at build/boot rather than letting every
  // canonical, sitemap entry and social URL come out wrong.
  metadataBase: new URL(siteBaseUrl()),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  // Site-wide fallbacks. A route that builds its own metadata replaces these
  // wholesale; routes without one (admin, design-system) still emit a valid,
  // absolute card instead of nothing.
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName,
    title: siteName,
    description: siteDescription,
    images: [
      {
        url: absoluteUrl(DEFAULT_OG_IMAGE),
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: siteDescription,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), alt: siteName }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${newsreader.variable} ${archivo.variable} h-full`}
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {/* First focusable element on every page. Hidden until focused, then
            pinned to the top-left where it is expected. */}
        <a
          href="#main"
          className="sr-only-focusable focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-100 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:font-ui focus-visible:text-body-sm focus-visible:text-on-primary"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}