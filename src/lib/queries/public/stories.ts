import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { StoryCardData } from "@/components/stories/StoryCard";
import {
  PUBLIC_STORY_WHERE,
} from "@/lib/queries/public/story-filter";
import {
  STORY_CARD_SELECT,
  toStoryCard,
} from "@/lib/queries/public/story-card";
import {
  queryStoryList,
  type StoryListParams,
  type StoryListResult,
} from "@/lib/queries/public/story-list";
import { queryPublishedStoryDetail } from "@/lib/queries/public/story-detail";
import { queryPublishedChapterReader } from "@/lib/queries/public/chapters";

/**
 * Published story reads.
 *
 * This module is the only place `status = PUBLISHED` is applied to a story
 * query (AGENTS.md section 6). Pages and components receive already-filtered
 * data, so the visibility rule cannot be forgotten at a call site.
 *
 * A story is public as soon as it is `PUBLISHED`, whether or not any chapter is
 * published yet. A published story with only drafts is still listed; its detail
 * page omits the chapter list and start action. Counts of chapters elsewhere
 * remain published-only, so unpublished volume never leaks.
 *
 * Reads are cached and tagged; admin publish/unpublish/delete actions
 * invalidate the tags via `revalidateTag` (AGENTS.md section 6).
 */

export const PUBLIC_STORIES_TAG = "public:stories";

export { PUBLIC_STORY_WHERE };

const STORY_ORDER: Prisma.StoryOrderByWithRelationInput[] = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { slug: "asc" },
];

async function queryFeatured(limit: number): Promise<StoryCardData[]> {
  const rows = await prisma.story.findMany({
    where: { ...PUBLIC_STORY_WHERE, featured: true },
    select: STORY_CARD_SELECT,
    orderBy: STORY_ORDER,
    take: limit,
  });
  return rows.map(toStoryCard);
}

async function queryRecent(limit: number): Promise<StoryCardData[]> {
  const rows = await prisma.story.findMany({
    where: PUBLIC_STORY_WHERE,
    select: STORY_CARD_SELECT,
    orderBy: STORY_ORDER,
    take: limit,
  });
  return rows.map(toStoryCard);
}

async function queryPopular(limit: number): Promise<StoryCardData[]> {
  const rows = await prisma.story.findMany({
    where: PUBLIC_STORY_WHERE,
    select: STORY_CARD_SELECT,
    orderBy: [{ views: "desc" }, ...STORY_ORDER],
    take: limit,
  });
  return rows.map(toStoryCard);
}

async function queryCount(): Promise<number> {
  return prisma.story.count({ where: PUBLIC_STORY_WHERE });
}

const REVALIDATE_SECONDS = 300;

export const getFeaturedStories = unstable_cache(
  async (limit: number) => queryFeatured(limit),
  ["public:featured-stories"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);

export const getRecentStories = unstable_cache(
  async (limit: number) => queryRecent(limit),
  ["public:recent-stories"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);

export const getPopularStories = unstable_cache(
  async (limit: number) => queryPopular(limit),
  ["public:popular-stories"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);

export const getPublishedStoryCount = unstable_cache(
  async () => queryCount(),
  ["public:story-count"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);

/**
 * One filtered, paginated page of the public catalogue.
 *
 * Caching is applied only to request shapes whose cache keys the catalogue
 * itself bounds. A free-text term and an arbitrarily large page number are both
 * attacker-supplied and unbounded, so keying the data cache on them would let any
 * reader mint an entry per request, and every publish would then have to expire
 * all of them at once. Those requests read through to PostgreSQL; the taxonomy
 * facets (category, tags, sort) stay cached because the database bounds them.
 *
 * The raw query lives in `story-list.ts` so tests can exercise it without a
 * Next.js cache context.
 */
const MAX_CACHED_LIST_PAGE = 200;

const cachedStoryList = unstable_cache(
  async (params: StoryListParams) => queryStoryList(params),
  ["public:story-list"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);

export async function getPublishedStoryList(
  params: StoryListParams,
): Promise<StoryListResult> {
  if (!isCacheableStoryListRequest(params)) {
    return queryStoryList(params);
  }
  return cachedStoryList(params);
}

/**
 * Whether a catalogue request may be served from the data cache.
 *
 * Free text is excluded because its key space is unbounded. The page ceiling is
 * deliberately far above any real catalogue depth: the query layer clamps the
 * page to the true page count anyway, so a request beyond the ceiling asks for a
 * page that cannot exist and is better answered directly than stored.
 */
export function isCacheableStoryListRequest(params: {
  q: string;
  page: number;
}): boolean {
  if (params.q !== "") {
    return false;
  }
  return (
    Number.isInteger(params.page) &&
    params.page >= 1 &&
    params.page <= MAX_CACHED_LIST_PAGE
  );
}

/**
 * One published story with its published chapter list and related rail.
 *
 * Cached per slug; the raw query lives in `story-detail.ts` so integration
 * tests can exercise it without a Next.js cache context.
 */
export const getPublishedStoryDetail = unstable_cache(
  async (slug: string) => queryPublishedStoryDetail(slug),
  ["public:story-detail"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);

/**
 * One published chapter of a published story, with its published siblings.
 *
 * Cached per story/chapter slug pair; the raw query lives in `chapters.ts` so
 * integration tests can exercise it without a Next.js cache context.
 */
export const getPublishedChapterReader = unstable_cache(
  async (storySlug: string, chapterSlug: string) =>
    queryPublishedChapterReader(storySlug, chapterSlug),
  ["public:chapter-reader"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_STORIES_TAG] },
);


/**
 * One bounded slice of published story slugs for the sitemap.
 *
 * Ordered by the unique `id` so paging is deterministic and index-backed, and
 * `take` caps the slice, so no query ever materializes the whole catalogue.
 * Uncached so the sitemap builder can be exercised in integration tests.
 */
export async function queryPublishedStorySlugsPage(offset: number, take: number) {
  return prisma.story.findMany({
    where: PUBLIC_STORY_WHERE,
    select: { slug: true, publishedAt: true, updatedAt: true },
    orderBy: { id: "asc" },
    skip: offset,
    take,
  });
}

/**
 * One bounded slice of published chapter paths for the sitemap.
 *
 * Ordered by the unique `("storyId", "chapterNumber")` pair, which the
 * `("storyId", "chapterNumber")` index covers, so paging neither sorts nor
 * materializes the full chapter set.
 */
export async function queryPublishedStoryChapterPathsPage(
  offset: number,
  take: number,
) {
  const rows = await prisma.chapter.findMany({
    where: { status: "PUBLISHED", story: PUBLIC_STORY_WHERE },
    select: {
      slug: true,
      publishedAt: true,
      updatedAt: true,
      story: { select: { slug: true } },
    },
    orderBy: [{ storyId: "asc" }, { chapterNumber: "asc" }],
    skip: offset,
    take,
  });

  return rows.map((row) => ({
    storySlug: row.story.slug,
    chapterSlug: row.slug,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  }));
}
