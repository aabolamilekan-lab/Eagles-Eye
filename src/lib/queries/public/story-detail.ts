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
import { toPlainTextExcerpt } from "@/lib/format";

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
  updatedAt: true,
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
  /** ISO 8601; drives `dateModified` in metadata and JSON-LD. */
  updatedAt: string;
  /**
   * Plain-text search/metadata description, derived server-side: the stored
   * short description when it is substantial, otherwise an excerpt of the
   * first published chapter. Empty when neither exists (AGENTS.md section 16).
   */
  seoDescription: string;
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

export function toPublishedStoryDetail(
  row: StoryDetailRow,
  seoDescription: string,
): PublishedStoryDetail {
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
    updatedAt: row.updatedAt.toISOString(),
    seoDescription,
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

/**
 * A short description under this length is too thin to carry a search snippet
 * or a social card on its own, so the first published chapter's opening is
 * tried instead.
 */
const SEO_DESCRIPTION_MIN_LENGTH = 70;
const SEO_DESCRIPTION_LENGTH = 155;

/**
 * Derive the metadata description for one story.
 *
 * Stored text first — it was written for exactly this job. When it is too
 * short, the first published chapter's opening provides a real excerpt, but
 * only ever in place of a *shorter* base: an authored line outranks an
 * arbitrary sentence from the body. Runs one extra query at most, and only
 * when the base is thin; the caller is wrapped in the tagged read cache.
 */
async function deriveSeoDescription(
  storyId: string,
  shortDescription: string | null,
): Promise<string> {
  const base = (shortDescription ?? "").trim();
  if (base.length >= SEO_DESCRIPTION_MIN_LENGTH) {
    return base;
  }

  const firstChapter = await prisma.chapter.findFirst({
    where: { storyId, status: ContentStatus.PUBLISHED },
    orderBy: { chapterNumber: "asc" },
    select: { content: true },
  });
  const derived = toPlainTextExcerpt(firstChapter?.content, SEO_DESCRIPTION_LENGTH);

  return derived.length > base.length ? derived : base;
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
  const seoDescription = await deriveSeoDescription(
    row.id,
    row.shortDescription,
  );

  return {
    story: toPublishedStoryDetail(row, seoDescription),
    relatedStories,
  };
}
