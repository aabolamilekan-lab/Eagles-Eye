import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { StoryCardData } from "@/components/stories/StoryCard";
import { clampPage, type StorySort } from "@/lib/validation/story";
import {
  buildStorySearchWhere,
  STORY_SORT_ORDER,
  type StorySearchFilters,
} from "@/lib/queries/public/story-filter";
import { STORY_CARD_SELECT, toStoryCard } from "@/lib/queries/public/story-card";
import { PUBLIC_STORIES_TAG } from "@/lib/queries/public/stories";

/**
 * Published-story search query.
 *
 * Same shape as the catalogue query: pagination in SQL with `take`/`skip`,
 * count and page inside one transaction, and the public-visibility predicate
 * applied inside `buildStorySearchWhere`. The export is uncached on purpose so
 * integration tests can exercise it without a Next.js cache context;
 * `searchPublishedStories` decides per request whether the tagged cache applies
 * (AGENTS.md section 6).
 */

/** One search result page. Deliberately smaller than the catalogue page. */
export const SEARCH_PAGE_SIZE = 10;

export interface StorySearchParams extends StorySearchFilters {
  sort: StorySort;
  /** Requested page; clamped to the real page count inside the query. */
  page: number;
}

export interface StorySearchResult {
  stories: StoryCardData[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export async function queryStorySearch(
  params: StorySearchParams,
): Promise<StorySearchResult> {
  const where = buildStorySearchWhere(params);

  return prisma.$transaction(async (tx) => {
    const total = await tx.story.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
    const page = clampPage(params.page, pageCount);

    const rows =
      total === 0
        ? []
        : await tx.story.findMany({
            where,
            select: STORY_CARD_SELECT,
            orderBy: STORY_SORT_ORDER[params.sort],
            skip: (page - 1) * SEARCH_PAGE_SIZE,
            take: SEARCH_PAGE_SIZE,
          });

    return {
      stories: rows.map(toStoryCard),
      total,
      page,
      pageCount,
      pageSize: SEARCH_PAGE_SIZE,
    };
  });
}

/**
 * One normalized, paginated page of search results.
 *
 * A search term is reader-supplied and unbounded, so a term-bearing request reads
 * straight through to PostgreSQL rather than minting a data-cache entry: keying
 * the cache on arbitrary text would let any request grow the cache, and the next
 * publish would expire every entry at once. Facet-only browsing has no free text
 * and a key space the taxonomy bounds, so it stays cached, and it is tagged with
 * the public-stories tag so an admin publish, unpublish or delete drops it
 * alongside the rest of the public reads (AGENTS.md section 6).
 */
const MAX_CACHED_SEARCH_PAGE = 200;

const cachedFacetSearch = unstable_cache(
  async (params: StorySearchParams) => queryStorySearch(params),
  ["public:story-search"],
  { revalidate: 300, tags: [PUBLIC_STORIES_TAG] },
);

export async function searchPublishedStories(
  params: StorySearchParams,
): Promise<StorySearchResult> {
  if (!isCacheableSearchRequest(params)) {
    return queryStorySearch(params);
  }
  return cachedFacetSearch(params);
}

/** Whether a search request may be served from the data cache. */
export function isCacheableSearchRequest(params: {
  q: string;
  page: number;
}): boolean {
  if (params.q !== "") {
    return false;
  }
  return (
    Number.isInteger(params.page) &&
    params.page >= 1 &&
    params.page <= MAX_CACHED_SEARCH_PAGE
  );
}
