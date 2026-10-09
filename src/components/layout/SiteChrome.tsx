import type { ReactNode } from "react";
import { KeyboardShortcuts } from "@/components/navigation/KeyboardShortcuts";
import { SiteFooter } from "@/components/navigation/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Wordmark } from "@/components/navigation/Wordmark";

/**
 * The public reader chrome: header, the single `main` landmark, and footer.
 *
 * Pages rendered inside `(public)` render content only. The landmark lives
 * here so the skip link in the root layout always resolves and every public
 * page has exactly one `main`.
 */
const NAV = [
  { label: "Stories", href: "/stories" },
  { label: "Categories", href: "/categories" },
  { label: "Search", href: "/search" },
  { label: "About", href: "/about" },
];

const FOOTER_SECTIONS = [
  {
    heading: "Read",
    links: [
      { label: "Stories", href: "/stories" },
      { label: "Categories", href: "/categories" },
      { label: "Search", href: "/search" },
    ],
  },
  {
    heading: "About",
    links: [{ label: "About Eagles Eye", href: "/about" }],
  },
];

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <KeyboardShortcuts />
      <SiteHeader brand={<Wordmark tone="ink" />} nav={NAV} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter sections={FOOTER_SECTIONS} />
    </div>
  );
}
