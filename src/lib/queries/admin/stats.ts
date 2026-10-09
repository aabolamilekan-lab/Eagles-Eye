import { ContentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Admin dashboard reads.
 *
 * Every figure here is counted from the database; nothing is estimated or
 * invented. The module is server-only and is called behind a `stats.view`
 * capability check at the page boundary (AGENTS.md sections 8 and 14).
 *
 * Aggregates use `groupBy`/`count`/`aggregate` rather than fetching rows, so
 * the dashboard stays cheap as the catalogue grows.
 */

export interface StatusBreakdown {
  draft: number;
  published: number;
  archived: number;
  total: number;
}

export interface RecentStory {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  featured: boolean;
  updatedAt: Date;
  publishedAt: Date | null;
  category: { name: string; slug: string } | null;
  chapterCount: number;
  publishedChapterCount: number;
}

export interface RecentChapter {
  id: string;
  title: string;
  slug: string;
  chapterNumber: number;
  status: ContentStatus;
  updatedAt: Date;
  publishedAt: Date | null;
  story: { id: string; title: string; slug: string };
}

export interface RecentView {
  id: string;
  viewedAt: Date;
  story: { id: string; title: string; slug: string };
  chapter: { title: string; slug: string } | null;
}

export interface AdminDashboard {
  stories: StatusBreakdown;
  chapters: StatusBreakdown;
  categories: number;
  tags: number;
  /** Sum of the denormalised `Story.views` counter. */
  totalStoryViews: number;
  /** Individual anonymous view records on file. A different measure to the counter. */
  recordedViews: number;
  storiesPublishedThisYear: number;
  chaptersPublishedThisYear: number;
  recentStories: RecentStory[];
  recentChapters: RecentChapter[];
  recentViews: RecentView[];
}

const RECENT_LIMIT = 6;

/**
 * Start of `now`'s UTC year and the start of the next. UTC keeps the window
 * deterministic regardless of server time zone, and lets tests pin the clock.
 */
export function yearWindow(now: Date): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

/** Fold Prisma status groups into a stable, zero-filled breakdown. */
export function toBreakdown(
  groups: Array<{ status: ContentStatus; _count: { _all: number } }>,
): StatusBreakdown {
  const breakdown: StatusBreakdown = {
    draft: 0,
    published: 0,
    archived: 0,
    total: 0,
  };

  for (const group of groups) {
    const count = group._count._all;
    breakdown.total += count;

    switch (group.status) {
      case ContentStatus.DRAFT:
        breakdown.draft += count;
        break;
      case ContentStatus.PUBLISHED:
        breakdown.published += count;
        break;
      case ContentStatus.ARCHIVED:
        breakdown.archived += count;
        break;
    }
  }

  return breakdown;
}

export async function getAdminDashboard(
  now: Date = new Date(),
): Promise<AdminDashboard> {
  const { start, end } = yearWindow(now);
  const publishedThisYear = { gte: start, lt: end };

  const [
    storyGroups,
    chapterGroups,
    categories,
    tags,
    viewSum,
    recordedViews,
    storiesPublishedThisYear,
    chaptersPublishedThisYear,
    recentStories,
    recentChapters,
    recentViews,
  ] = await Promise.all([
    prisma.story.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.chapter.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.count(),
    prisma.tag.count(),
    prisma.story.aggregate({ _sum: { views: true } }),
    prisma.storyView.count(),
    prisma.story.count({ where: { publishedAt: publishedThisYear } }),
    prisma.chapter.count({ where: { publishedAt: publishedThisYear } }),
    prisma.story.findMany({
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        featured: true,
        updatedAt: true,
        publishedAt: true,
        category: { select: { name: true, slug: true } },
        _count: { select: { chapters: true } },
        chapters: {
          where: { status: ContentStatus.PUBLISHED },
          select: { id: true },
        },
      },
    }),
    prisma.chapter.findMany({
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        slug: true,
        chapterNumber: true,
        status: true,
        updatedAt: true,
        publishedAt: true,
        story: { select: { id: true, title: true, slug: true } },
      },
    }),
    prisma.storyView.findMany({
      orderBy: { viewedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        viewedAt: true,
        story: { select: { id: true, title: true, slug: true } },
        chapter: { select: { title: true, slug: true } },
      },
    }),
  ]);

  return {
    stories: toBreakdown(storyGroups),
    chapters: toBreakdown(chapterGroups),
    categories,
    tags,
    totalStoryViews: viewSum._sum.views ?? 0,
    recordedViews,
    storiesPublishedThisYear,
    chaptersPublishedThisYear,
    recentStories: recentStories.map((story) => ({
      id: story.id,
      title: story.title,
      slug: story.slug,
      status: story.status,
      featured: story.featured,
      updatedAt: story.updatedAt,
      publishedAt: story.publishedAt,
      category: story.category,
      chapterCount: story._count.chapters,
      publishedChapterCount: story.chapters.length,
    })),
    recentChapters,
    recentViews,
  };
}
