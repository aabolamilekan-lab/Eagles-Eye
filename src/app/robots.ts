import type { MetadataRoute } from "next";
import { absoluteUrl, siteBaseUrl } from "@/lib/seo/canonical";

export const dynamic = "force-dynamic";

/**
 * Crawl policy.
 *
 * Exactly three disallows: admin (all of it, including the login route),
 * the API surface, and nothing else — the design-system is kept out by its
 * own page-level `noindex`, which is the signal search engines actually
 * honour for a page they are allowed to fetch.
 *
 * The `host` and absolute `sitemap` both come from the validated base URL,
 * so a misconfigured host cannot quietly publish a wrong origin here while
 * canonicals say something else.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/login", "/api/"],
      },
    ],
    host: new URL(siteBaseUrl()).origin,
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
