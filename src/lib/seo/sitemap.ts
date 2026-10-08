import type { MetadataRoute } from "next";
import { absoluteUrl } from "./canonical";

/**
 * Sitemap sizing.
 *
 * The sitemap protocol allows 50,000 URLs per file (or 50 MB uncompressed). The
 * generator reads the catalogue in bounded pages and stops at that ceiling, so a
 * single request never has to materialize every published story and chapter.
 */
export const SITEMAP_URL_LIMIT = 50_000;

/** Rows read per query. Bounds memory; the ceiling above bounds the output. */
export const SITEMAP_PAGE_SIZE = 5_000;

/** Ceiling on category pages, which are enumerated whole. */
export const SITEMAP_CATEGORY_LIMIT = 1_000;

/** Resolve a stored timestamp, falling back when the column is null. */
export function sitemapLastModified(
  primary: Date | null | undefined,
  fallback: Date,
): Date {
  if (!primary) {
    return fallback;
  }
  const date = primary instanceof Date ? primary : new Date(primary);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/**
 * Static entries: home, catalogue, categories index, and about.
 *
 * `lastmod` is the newest published content date the caller saw — never the
 * wall clock. Two builds over the same database produce byte-identical output,
 * because a `new Date()` here would claim every static page changed on every
 * request, a signal crawlers learn to discount (`.agent/skills/seo/SKILL.md`).
 * With no content yet there is nothing to date, and the field is omitted
 * rather than filled with a lie; `lastmod` is optional in the protocol.
 *
 * Every URL resolves through the canonical builder: no page — and no
 * sitemap — concatenates a base URL by hand.
 */
export function buildStaticEntries(
  baseUrl: string,
  categories: Array<{ slug: string }>,
  latest?: Date,
): MetadataRoute.Sitemap {
  const lastModified = latest ? { lastModified: latest } : {};

  return [
    {
      url: absoluteUrl("/", baseUrl),
      ...lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/stories", baseUrl),
      ...lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/categories", baseUrl),
      ...lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...categories.map((category) => ({
      url: absoluteUrl(`/categories/${category.slug}`, baseUrl),
      ...lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    {
      url: absoluteUrl("/about", baseUrl),
      ...lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
