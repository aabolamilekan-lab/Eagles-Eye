import type { MetadataRoute } from "next";
import { queryPublishedCategories } from "@/lib/queries/public/categories";
import {
  queryPublishedStoryChapterPathsPage,
  queryPublishedStorySlugsPage,
} from "@/lib/queries/public/stories";
import { logger } from "@/lib/logger";
import { absoluteUrl } from "@/lib/seo/canonical";
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
 * Content is assembled first and the static entries last, so the static pages
 * can be dated by the newest published URL instead of by the wall clock — two
 * runs over the same database now produce identical output
 * (`.agent/skills/seo/SKILL.md`, sitemap rules).
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
  const categories = await queryPublishedCategories(SITEMAP_CATEGORY_LIMIT);
  const content: MetadataRoute.Sitemap = [];

  const stories = await appendStoryEntries(content, baseUrl);
  const chapters = await appendChapterEntries(content, baseUrl);

  const entries: MetadataRoute.Sitemap = [
    ...buildStaticEntries(
      baseUrl,
      categories.map((category) => ({ slug: category.slug })),
      latestContentDate(content),
    ),
    ...content,
  ];

  if (stories.truncated || chapters.truncated) {
    logger.warn("sitemap.url_limit_reached", {
      limit: SITEMAP_URL_LIMIT,
      emitted: entries.length,
    });
  }

  return entries;
}

/** Remaining capacity under the protocol ceiling. */
function room(content: MetadataRoute.Sitemap): number {
  return SITEMAP_URL_LIMIT - content.length;
}

/** The newest published date across the content entries, if any. */
function latestContentDate(
  content: MetadataRoute.Sitemap,
): Date | undefined {
  let latest: Date | undefined;

  for (const entry of content) {
    const value = entry.lastModified;
    if (value === undefined) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (latest === undefined || date > latest) {
      latest = date;
    }
  }

  return latest;
}

/**
 * Append published story URLs until the ceiling or the catalogue runs out.
 *
 * `lastmod` is `Story.publishedAt`, falling back to `updatedAt` only when the
 * publish timestamp is absent — never the current time.
 */
async function appendStoryEntries(
  content: MetadataRoute.Sitemap,
  baseUrl: string,
): Promise<{ truncated: boolean }> {
  let offset = 0;

  while (content.length < SITEMAP_URL_LIMIT) {
    const take = Math.min(SITEMAP_PAGE_SIZE, room(content));
    const rows = await queryPublishedStorySlugsPage(offset, take);

    if (rows.length === 0) {
      return { truncated: false };
    }

    for (const row of rows) {
      content.push({
        url: absoluteUrl(`/stories/${row.slug}`, baseUrl),
        lastModified: sitemapLastModified(row.publishedAt, row.updatedAt),
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
  content: MetadataRoute.Sitemap,
  baseUrl: string,
): Promise<{ truncated: boolean }> {
  let offset = 0;

  while (content.length < SITEMAP_URL_LIMIT) {
    const take = Math.min(SITEMAP_PAGE_SIZE, room(content));
    const rows = await queryPublishedStoryChapterPathsPage(offset, take);

    if (rows.length === 0) {
      return { truncated: false };
    }

    for (const row of rows) {
      content.push({
        url: absoluteUrl(
          `/stories/${row.storySlug}/chapter/${row.chapterSlug}`,
          baseUrl,
        ),
        lastModified: sitemapLastModified(row.publishedAt, row.updatedAt),
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
