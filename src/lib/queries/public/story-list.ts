import { prisma } from "@/lib/db";
import type { StoryCardData } from "@/components/stories/StoryCard";
import {
  clampPage,
  STORY_PAGE_SIZE,
  type StorySort,
} from "@/lib/validation/story";
import {
  buildStoryListWhere,
  STORY_SORT_ORDER,
  type StoryListFilters,
} from "@/lib/queries/public/story-filter";
import { STORY_CARD_SELECT, toStoryCard } from "@/lib/queries/public/story-card";

/**
 * Catalogue listing query.
 *
 * Pagination happens here, in SQL, with `take`/`skip` — never by slicing an
 * already-rendered list. Count and page run inside one transaction so the
 * clamp and the rows come from the same snapshot. The export is uncached on
 * purpose; the cached wrapper lives in `stories.ts`, which keeps this module
 * importable by integration tests without a Next.js cache context.
 */

export interface StoryListParams extends StoryListFilters {
  sort: StorySort;
  /** Requested page; clamped to the real page count inside the query. */
  page: number;
}

export interface StoryListResult {
  stories: StoryCardData[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export async function queryStoryList(
  params: StoryListParams,
): Promise<StoryListResult> {
  const where = buildStoryListWhere(params);

  return prisma.$transaction(async (tx) => {
    const total = await tx.story.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / STORY_PAGE_SIZE));
    const page = clampPage(params.page, pageCount);

    const rows =
      total === 0
        ? []
        : await tx.story.findMany({
            where,
            select: STORY_CARD_SELECT,
            orderBy: STORY_SORT_ORDER[params.sort],
            skip: (page - 1) * STORY_PAGE_SIZE,
            take: STORY_PAGE_SIZE,
          });

    return {
      stories: rows.map(toStoryCard),
      total,
      page,
      pageCount,
      pageSize: STORY_PAGE_SIZE,
    };
  });
}
