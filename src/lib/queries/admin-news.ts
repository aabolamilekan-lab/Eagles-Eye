import { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AdminNewsListFilter {
  status?: "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
  category?: string | null;
  page?: number;
  pageSize?: number;
}

export interface AdminNewsListRow {
  id: string; // ImportedArticle ID
  title: string;
  author: string | null;
  canonicalUrl: string;
  rawPublishedAt: Date | null;
  syncStatus: string;
  createdAt: Date;
  source: {
    id: string;
    name: string;
    slug: string;
  };
  story: {
    id: string;
    slug: string;
    title: string;
    status: ContentStatus;
    publishedAt: Date | null;
    updatedAt: Date;
    shortDescription: string | null;
    category: {
      name: string;
      slug: string;
    } | null;
  };
}

export interface AdminNewsListResult {
  items: AdminNewsListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export interface AdminNewsItemDetail {
  story: {
    id: string;
    slug: string;
    title: string;
    author: string | null;
    shortDescription: string | null;
    description: string | null;
    status: ContentStatus;
    publishedAt: Date | null;
    updatedAt: Date;
    categoryId: string | null;
    category: {
      id: string;
      name: string;
      slug: string;
    } | null;
  };
  importedArticle: {
    id: string;
    canonicalUrl: string;
    title: string;
    author: string | null;
    rawPublishedAt: Date | null;
    summary: string | null;
    contentHash: string;
    syncStatus: string;
    source: {
      id: string;
      name: string;
      slug: string;
      attributionPolicy: string | null;
    };
  };
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Query imported news articles for the admin editorial queue.
 * Uncached, status-agnostic, and ordered newest first by default.
 */
export async function queryAdminNewsList(
  filters: AdminNewsListFilter = {},
): Promise<AdminNewsListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ImportedArticleWhereInput = {
    story: { isNot: null },
  };

  // Filter by Story status
  if (filters.status && filters.status !== "ALL") {
    where.story = {
      is: {
        status: filters.status,
      },
    };
  }

  // Filter by category slug if provided
  if (filters.category && filters.category.trim() !== "") {
    where.story = {
      ...(where.story?.is ? where.story.is : {}),
      category: {
        slug: filters.category.trim(),
      },
    };
  }

  // Order newest first by default (rawPublishedAt desc, falling back to createdAt desc)
  const orderBy: Prisma.ImportedArticleOrderByWithRelationInput[] = [
    { rawPublishedAt: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
    { id: "desc" },
  ];

  const [total, rows] = await Promise.all([
    prisma.importedArticle.count({ where }),
    prisma.importedArticle.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        author: true,
        canonicalUrl: true,
        rawPublishedAt: true,
        syncStatus: true,
        createdAt: true,
        source: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        story: {
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            publishedAt: true,
            updatedAt: true,
            shortDescription: true,
            category: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const items: AdminNewsListRow[] = rows
    .filter((row): row is typeof row & { story: NonNullable<typeof row.story> } => row.story !== null)
    .map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      canonicalUrl: row.canonicalUrl,
      rawPublishedAt: row.rawPublishedAt,
      syncStatus: row.syncStatus,
      createdAt: row.createdAt,
      source: row.source,
      story: row.story,
    }));

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    page,
    pageCount,
    pageSize,
  };
}

/**
 * Query an individual story and its source imported article for editorial review.
 */
export async function queryAdminNewsItem(
  storyId: string,
): Promise<AdminNewsItemDetail | null> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      slug: true,
      title: true,
      author: true,
      shortDescription: true,
      description: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      importedArticles: {
        take: 1,
        select: {
          id: true,
          canonicalUrl: true,
          title: true,
          author: true,
          rawPublishedAt: true,
          summary: true,
          contentHash: true,
          syncStatus: true,
          source: {
            select: {
              id: true,
              name: true,
              slug: true,
              attributionPolicy: true,
            },
          },
        },
      },
    },
  });

  if (!story || story.importedArticles.length === 0) {
    return null;
  }

  const article = story.importedArticles[0]!;

  return {
    story: {
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      shortDescription: story.shortDescription,
      description: story.description,
      status: story.status,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
      categoryId: story.categoryId,
      category: story.category,
    },
    importedArticle: article,
  };
}

/**
 * Available category options for editorial assignment.
 */
export async function queryNewsCategoryOptions(): Promise<
  Array<{ id: string; name: string; slug: string }>
> {
  return prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export interface AdminNewsSourceRow {
  id: string;
  name: string;
  slug: string;
  feedUrl: string;
  feedType: string;
  isActive: boolean;
  pollIntervalMinutes: number;
  lastFetchedAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  attributionPolicy: string | null;
  createdAt: Date;
  defaultCategory: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _count: {
    importedArticles: number;
    syncLogs: number;
  };
}

/**
 * Query all configured news sources with health metrics for the admin interface.
 */
export async function queryAdminNewsSources(): Promise<AdminNewsSourceRow[]> {
  const sources = await prisma.newsSource.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      feedUrl: true,
      feedType: true,
      isActive: true,
      pollIntervalMinutes: true,
      lastFetchedAt: true,
      lastSuccessAt: true,
      lastErrorAt: true,
      lastErrorMessage: true,
      consecutiveFailures: true,
      attributionPolicy: true,
      createdAt: true,
      defaultCategory: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      _count: {
        select: {
          importedArticles: true,
          syncLogs: true,
        },
      },
    },
  });

  return sources;
}

export interface AdminNewsSyncLogRow {
  id: string;
  jobId: string;
  status: string;
  articlesDiscovered: number;
  articlesImported: number;
  articlesSkipped: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  source: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface AdminNewsSyncLogsResult {
  items: AdminNewsSyncLogRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

/**
 * Query recent synchronization job runs for monitoring.
 */
export async function queryAdminNewsSyncLogs(
  page = 1,
  pageSize = 25,
): Promise<AdminNewsSyncLogsResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(100, pageSize));
  const skip = (safePage - 1) * safePageSize;

  const [total, rows] = await Promise.all([
    prisma.newsSyncLog.count(),
    prisma.newsSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      skip,
      take: safePageSize,
      select: {
        id: true,
        jobId: true,
        status: true,
        articlesDiscovered: true,
        articlesImported: true,
        articlesSkipped: true,
        durationMs: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        source: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / safePageSize));

  return {
    items: rows,
    total,
    page: safePage,
    pageCount,
    pageSize: safePageSize,
  };
}

export interface AdminNewsSyncLockStatus {
  isLocked: boolean;
  lockedUntil: Date | null;
  lockedBy: string | null;
  updatedAt: Date | null;
}

/**
 * Query the current state of the global synchronization lock.
 */
export async function queryAdminNewsSyncLockStatus(): Promise<AdminNewsSyncLockStatus> {
  const lock = await prisma.newsSyncLock.findUnique({
    where: { id: "global_news_sync" },
    select: {
      lockedUntil: true,
      lockedBy: true,
      updatedAt: true,
    },
  });

  const now = new Date();
  const isLocked = Boolean(lock?.lockedUntil && lock.lockedUntil > now);

  return {
    isLocked,
    lockedUntil: lock?.lockedUntil ?? null,
    lockedBy: lock?.lockedBy ?? null,
    updatedAt: lock?.updatedAt ?? null,
  };
}
