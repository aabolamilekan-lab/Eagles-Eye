import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

/**
 * Only public surfaces are crawlable. Admin, API and internal design-system
 * routes are disallowed. Draft/archived content never appears in sitemap;
 * robots points to it as the single canonical index of crawlable URLs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/design-system"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
