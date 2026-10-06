import { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ChapterListItem } from "@/components/chapters/ChapterList";
import type { StoryCardData } from "@/components/stories/StoryCard";
import {
  buildRelatedStoryWhere,
  type RelatedStorySignals,
} from "@/lib/queries/public/story-filter";
import {
  coverUrl,
  STORY_CARD_SELECT,
  toStoryCard,
} from "@/lib/queries/public/story-card";

/**
 * Published story detail read.
 *
 * One story by slug, its published chapter list, and its related rail. The
 * story must be `PUBLISHED`; draft and archived stories resolve to `null`, which
 * the page turns into the same `notFound()` as an unknown slug (AGENTS.md
 * section 6).
 *
 * The chapter list is filtered to `PUBLISHED` in the `select`, so a draft or
 * archived chapter can never reach the reader, and the chapter count is the
 * count of published rows rather than a story-level number that would leak
 * unpublished volume.
 */

export const RELATED_STORIES_LIMIT = 4;

export const STORY_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  author: true,
  shortDescription: true,
  description: true,
  coverImage: true,
  views: true,
  publishedAt: true,
  categoryId: true,
  category: { select: { name: true, slug: true } },
  storyTags: {
    select: { tagId: true, tag: { select: { name: true, slug: true } } },
  },
  chapters: {
    where: { status: ContentStatus.PUBLISHED },
    orderBy: { chapterNumber: "asc" },
    select: {
      slug: true,
      title: true,
      chapterNumber: true,
      publishedAt: true,
    },
  },
} satisfies Prisma.StorySelect;

export type StoryDetailRow = Prisma.StoryGetPayload<{
  select: typeof STORY_DETAIL_SELECT;
}>;

export interface PublishedStoryDetail {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  /** Plain text for the lead line and metadata. */
  shortDescription: string;
  /** Sanitized rich text; rendered through `RichText` only. */
  description: string | null;
  coverImageUrl: string | null;
  coverAlt: string | null;
  views: number;
  /** ISO 8601, or null when the story is not published. */
  publishedAt: string | null;
  category: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
  chapters: ChapterListItem[];
  chapterCount: number;
  hasPublishedChapters: boolean;
}

export interface PublishedStoryPage {
  story: PublishedStoryDetail;
  relatedStories: StoryCardData[];
}

export function toPublishedStoryDetail(row: StoryDetailRow): PublishedStoryDetail {
  // `coverAlt` follows the resolved URL rather than the raw column, so an
  // unservable value yields the no-cover placeholder, not alt text for an image
  // that is not there.
  const cover = coverUrl(row.coverImage);

  const chapters: ChapterListItem[] = row.chapters.map((chapter) => ({
    slug: chapter.slug,
    title: chapter.title,
    number: chapter.chapterNumber,
    // Reading time is not stored and is not derived by pulling every body in.
    readingMinutes: null,
    publishedAt: chapter.publishedAt
      ? chapter.publishedAt.toISOString()
      : null,
    // The story detail page is not inside a chapter, so none is current.
    isCurrent: false,
  }));

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    shortDescription: row.shortDescription ?? "",
    description: row.description,
    coverImageUrl: cover,
    coverAlt: cover ? row.title : null,
    views: row.views,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    category: row.category,
    tags: row.storyTags.map((entry) => entry.tag),
    chapters,
    chapterCount: chapters.length,
    hasPublishedChapters: chapters.length > 0,
  };
}

export async function queryRelatedStories(
  signals: RelatedStorySignals,
  limit: number = RELATED_STORIES_LIMIT,
): Promise<StoryCardData[]> {
  const rows = await prisma.story.findMany({
    where: buildRelatedStoryWhere(signals),
    select: STORY_CARD_SELECT,
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
    take: limit,
  });
  return rows.map(toStoryCard);
}

export async function queryPublishedStoryDetail(
  slug: string,
): Promise<PublishedStoryPage | null> {
  const row = await prisma.story.findFirst({
    where: { slug, status: ContentStatus.PUBLISHED },
    select: STORY_DETAIL_SELECT,
  });

  if (!row) {
    return null;
  }

  const relatedStories = await queryRelatedStories({
    excludeStoryId: row.id,
    categoryId: row.categoryId,
    tagIds: row.storyTags.map((entry) => entry.tagId),
  });

  return { story: toPublishedStoryDetail(row), relatedStories };
}
