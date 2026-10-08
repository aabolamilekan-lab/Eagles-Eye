import { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ChapterListItem } from "@/components/chapters/ChapterList";
import {
  resolveChapterNeighbours,
  type ChapterNeighbours,
} from "@/lib/queries/public/chapter-order";
import { PUBLIC_STORY_WHERE } from "@/lib/queries/public/story-filter";
import { coverUrl } from "@/lib/seo/cover-url";

/**
 * Published chapter reader read.
 *
 * A chapter is readable only when its story is public (`PUBLISHED` with at
 * least one `PUBLISHED` chapter) **and** the chapter itself is `PUBLISHED`. Any
 * other combination resolves to `null`, which the page turns into the same
 * `notFound()` as an unknown slug, so a draft never betrays its existence
 * (AGENTS.md section 6).
 *
 * The published chapter list drives both navigation and the by-index list.
 * Neighbours are resolved here, over the already-filtered list, so a draft or
 * archived sibling can never be offered and the view never computes order.
 *
 * Chapter positions shown to the reader are their position in the published
 * sequence, not the stored `chapterNumber`, so a gap left by a draft cannot
 * leak unpublished volume through arithmetic.
 */

const READER_STORY_SELECT = {
  id: true,
  slug: true,
  title: true,
  author: true,
  coverImage: true,
  chapters: {
    where: { status: ContentStatus.PUBLISHED },
    orderBy: { chapterNumber: "asc" },
    select: {
      slug: true,
      title: true,
      publishedAt: true,
    },
  },
} satisfies Prisma.StorySelect;

type ReaderStoryRow = Prisma.StoryGetPayload<{
  select: typeof READER_STORY_SELECT;
}>;

export interface PublishedChapterReader {
  story: {
    slug: string;
    title: string;
    author: string | null;
    /** Resolved cover path; null when the story has no usable cover. */
    coverImageUrl: string | null;
  };
  chapter: {
    slug: string;
    title: string;
    content: string;
    /** ISO 8601, or null when the chapter has none. */
    publishedAt: string | null;
    /** ISO 8601; drives `dateModified` in the chapter's JSON-LD. */
    updatedAt: string;
  };
  /** Every published chapter, in reading order, with the current one flagged. */
  chapters: ChapterListItem[];
  previous: ChapterNeighbours["previous"];
  next: ChapterNeighbours["next"];
  currentNumber: number;
  totalCount: number;
}

function toChapterListItems(
  row: ReaderStoryRow,
  currentSlug: string,
): ChapterListItem[] {
  return row.chapters.map((chapter, index) => ({
    slug: chapter.slug,
    title: chapter.title,
    // Published position, not the stored number: a gap cannot leak a draft.
    number: index + 1,
    readingMinutes: null,
    publishedAt: chapter.publishedAt
      ? chapter.publishedAt.toISOString()
      : null,
    isCurrent: chapter.slug === currentSlug,
  }));
}

/**
 * The chapter being read, plus the story's public state.
 *
 * Resolved in one round trip: the relation filter carries the same
 * public-visibility predicate as {@link PUBLIC_STORY_WHERE}, so the chapter body
 * can be found by its own slug without first reading the story row.
 */
const READER_CHAPTER_SELECT = {
  slug: true,
  title: true,
  content: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.ChapterSelect;

export async function queryPublishedChapterReader(
  storySlug: string,
  chapterSlug: string,
): Promise<PublishedChapterReader | null> {
  // The two reads are independent: the chapter body is found by the story slug
  // through the relation filter, so they no longer wait on each other.
  const [story, current] = await Promise.all([
    prisma.story.findFirst({
      where: { ...PUBLIC_STORY_WHERE, slug: storySlug },
      select: READER_STORY_SELECT,
    }),
    prisma.chapter.findFirst({
      where: {
        slug: chapterSlug,
        status: ContentStatus.PUBLISHED,
        story: { ...PUBLIC_STORY_WHERE, slug: storySlug },
      },
      select: READER_CHAPTER_SELECT,
    }),
  ]);

  if (!story || !current) {
    return null;
  }

  const index = story.chapters.findIndex(
    (chapter) => chapter.slug === chapterSlug,
  );
  if (index < 0) {
    return null;
  }

  const neighbours = resolveChapterNeighbours(story.chapters, index);

  return {
    story: {
      slug: story.slug,
      title: story.title,
      author: story.author,
      coverImageUrl: coverUrl(story.coverImage),
    },
    chapter: {
      slug: current.slug,
      title: current.title,
      content: current.content,
      publishedAt: current.publishedAt ? current.publishedAt.toISOString() : null,
      updatedAt: current.updatedAt.toISOString(),
    },
    chapters: toChapterListItems(story, chapterSlug),
    previous: neighbours.previous,
    next: neighbours.next,
    currentNumber: neighbours.currentNumber,
    totalCount: neighbours.totalCount,
  };
}
