import type { Metadata } from "next";
import { Newsreader, Archivo } from "next/font/google";
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
  // Absolute base for canonical URLs, Open Graph, and the sitemap. Public and
  // safe to default when unset; it is not a secret.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Eagles Eye",
    template: "%s | Eagles Eye",
  },
  description: "Read and publish stories.",
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