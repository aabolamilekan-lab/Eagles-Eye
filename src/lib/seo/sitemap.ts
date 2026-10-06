import type { MetadataRoute } from "next";

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

/** Static entries: home, catalogue, categories index, and about. */
export function buildStaticEntries(
  baseUrl: string,
  now: Date,
  categories: Array<{ slug: string }>,
): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/stories`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categories`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...categories.map((category) => ({
      url: `${baseUrl}/categories/${category.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
