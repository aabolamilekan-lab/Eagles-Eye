import type { MetadataRoute } from "next";
import { queryPublishedCategories } from "@/lib/queries/public/categories";
import {
  queryPublishedStoryChapterPathsPage,
  queryPublishedStorySlugsPage,
} from "@/lib/queries/public/stories";
import { logger } from "@/lib/logger";
import {
  buildStaticEntries,
  sitemapLastModified,
  SITEMAP_CATEGORY_LIMIT,
  SITEMAP_PAGE_SIZE,
  SITEMAP_URL_LIMIT,
} from "@/lib/seo/sitemap";

/**
 * Sitemap assembly.
 *
 * The catalogue is read in bounded pages and appended incrementally, so one
 * request never materializes the whole story or chapter set: at most
 * `SITEMAP_PAGE_SIZE` content rows are resident at a time. Every content read goes
 * through the public query layer, which applies `status = PUBLISHED` internally,
 * so `DRAFT` and `ARCHIVED` content cannot reach the sitemap (AGENTS.md
 * section 6).
 *
 * Output is capped at the protocol's 50,000-URL ceiling. A catalogue large enough
 * to reach that cap is logged server-side rather than silently truncated, because
 * the correct follow-up is a sitemap index, not a shorter sitemap.
 *
 * Uncached on purpose so integration tests can assert the visibility and bounds
 * guarantees; `src/app/sitemap.ts` wraps this in the tagged cache.
 */
export async function querySitemap(
  baseUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const categories = await queryPublishedCategories(SITEMAP_CATEGORY_LIMIT);

  const entries: MetadataRoute.Sitemap = buildStaticEntries(
    baseUrl,
    now,
    categories.map((category) => ({ slug: category.slug })),
  );

  const stories = await appendStoryEntries(entries, baseUrl, now);
  const chapters = await appendChapterEntries(entries, baseUrl, now);

  if (stories.truncated || chapters.truncated) {
    logger.warn("sitemap.url_limit_reached", {
      limit: SITEMAP_URL_LIMIT,
      emitted: entries.length,
    });
  }

  return entries;
}

/** Remaining capacity under the protocol ceiling. */
function room(entries: MetadataRoute.Sitemap): number {
  return SITEMAP_URL_LIMIT - entries.length;
}

/**
 * Append published story URLs until the ceiling or the catalogue runs out.
 */
async function appendStoryEntries(
  entries: MetadataRoute.Sitemap,
  baseUrl: string,
  now: Date,
): Promise<{ truncated: boolean }> {
  let offset = 0;

  while (entries.length < SITEMAP_URL_LIMIT) {
    const take = Math.min(SITEMAP_PAGE_SIZE, room(entries));
    const rows = await queryPublishedStorySlugsPage(offset, take);

    if (rows.length === 0) {
      return { truncated: false };
    }

    for (const row of rows) {
      entries.push({
        url: `${baseUrl}/stories/${row.slug}`,
        lastModified: sitemapLastModified(
          row.publishedAt ?? row.updatedAt,
          now,
        ),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    offset += rows.length;

    if (rows.length < take) {
      return { truncated: false };
    }
  }

  // The ceiling was reached with a full page still available.
  return { truncated: true };
}

/**
 * Append published chapter URLs until the ceiling or the catalogue runs out.
 */
async function appendChapterEntries(
  entries: MetadataRoute.Sitemap,
  baseUrl: string,
  now: Date,
): Promise<{ truncated: boolean }> {
  let offset = 0;

  while (entries.length < SITEMAP_URL_LIMIT) {
    const take = Math.min(SITEMAP_PAGE_SIZE, room(entries));
    const rows = await queryPublishedStoryChapterPathsPage(offset, take);

    if (rows.length === 0) {
      return { truncated: false };
    }

    for (const row of rows) {
      entries.push({
        url: `${baseUrl}/stories/${row.storySlug}/chapter/${row.chapterSlug}`,
        lastModified: sitemapLastModified(
          row.publishedAt ?? row.updatedAt,
          now,
        ),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    offset += rows.length;

    if (rows.length < take) {
      return { truncated: false };
    }
  }

  return { truncated: true };
}
