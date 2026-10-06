/**
 * Chapter ordering helpers.
 *
 * Pure and free of Prisma and `next/cache`, so the previous/next resolution is
 * unit-testable against fixtures with gaps in `chapterNumber` and interleaved
 * drafts. The reader query hands it an ordered, already-published-only list, so
 * a draft or archived sibling can never be offered.
 */

export interface ChapterNeighbourInput {
  slug: string;
  title: string;
}

export interface ChapterNeighbours {
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  /** 1-based position in the published sequence. */
  currentNumber: number;
  /** Total published chapters; never includes drafts. */
  totalCount: number;
}

export function resolveChapterNeighbours(
  chapters: ChapterNeighbourInput[],
  currentIndex: number,
): ChapterNeighbours {
  const totalCount = chapters.length;
  const previous = currentIndex > 0 ? chapters[currentIndex - 1] ?? null : null;
  const next =
    currentIndex >= 0 && currentIndex < totalCount - 1
      ? chapters[currentIndex + 1] ?? null
      : null;

  return {
    previous: previous ? { slug: previous.slug, title: previous.title } : null,
    next: next ? { slug: next.slug, title: next.title } : null,
    currentNumber: currentIndex + 1,
    totalCount,
  };
}
