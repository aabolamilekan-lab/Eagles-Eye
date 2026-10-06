import { ContentStatus, Prisma } from "@prisma/client";
import type { StoryCardData } from "@/components/stories/StoryCard";
import { coverUrl } from "@/lib/seo/cover-url";

export { coverUrl };

/**
 * The narrow shape every story card renders.
 *
 * One `select` and one mapper, shared by the home rails and the catalogue, so
 * the columns fetched and the card's data contract cannot drift apart.
 */

export const STORY_CARD_SELECT = {
  slug: true,
  title: true,
  author: true,
  shortDescription: true,
  coverImage: true,
  publishedAt: true,
  category: { select: { name: true, slug: true } },
  _count: {
    select: { chapters: { where: { status: ContentStatus.PUBLISHED } } },
  },
} satisfies Prisma.StorySelect;

export type StoryCardRow = Prisma.StoryGetPayload<{
  select: typeof STORY_CARD_SELECT;
}>;

export function toStoryCard(row: StoryCardRow): StoryCardData {
  // Resolved once. `coverAlt` follows the resolved URL, not the raw column, so
  // an unservable value produces the no-cover placeholder instead of alt text
  // for an image that is not there.
  const cover = coverUrl(row.coverImage);

  return {
    slug: row.slug,
    title: row.title,
    author: row.author,
    shortDescription: row.shortDescription ?? "",
    coverImageUrl: cover,
    coverAlt: cover ? row.title : null,
    category: row.category,
    chapterCount: row._count.chapters,
    // Reading time is not stored and is not derived here: pulling every
    // chapter body into a listing query would defeat the point of the cap.
    readingMinutes: null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}
