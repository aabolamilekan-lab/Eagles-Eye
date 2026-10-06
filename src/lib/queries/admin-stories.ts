import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ADMIN_STORY_PAGE_SIZE,
  clampPage,
  type AdminStorySort,
  type AdminStoryStatusFilter,
} from "@/lib/validation/story";
import { escapeLikeTerm } from "@/lib/queries/public/story-filter";

/**
 * Admin story reads.
 *
 * Deliberately uncached and status-agnostic: the admin surface must see drafts
 * and archived stories, unlike `src/lib/queries/public/`. The public filter is
 * never applied here, and these functions are never used by a public page.
 * .agent/skills/story-management/SKILL.md.
 */
export interface AdminStoryListParams {
  q: string;
  status: AdminStoryStatusFilter;
  category: string | null;
  sort: AdminStorySort;
  page: number;
}

export interface AdminStoryListRow {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  featured: boolean;
  coverImage: string | null;
  category: { name: string; slug: string } | null;
  chapterCount: number;
  publishedChapterCount: number;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface AdminStoryListResult {
  stories: AdminStoryListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

/** Fixed `orderBy` allowlist. No caller string ever reaches Prisma. */
const ADMIN_STORY_ORDER: Record<
  AdminStorySort,
  Prisma.StoryOrderByWithRelationInput[]
> = {
  updated: [{ updatedAt: "desc" }, { id: "asc" }],
  created: [{ createdAt: "desc" }, { id: "asc" }],
  title: [{ title: "asc" }, { id: "asc" }],
  published: [
    { publishedAt: { sort: "desc", nulls: "last" } },
    { id: "asc" },
  ],
};

const ADMIN_STORY_SELECT = {
  id: true,
  title: true,
  slug: true,
  author: true,
  status: true,
  featured: true,
  coverImage: true,
  updatedAt: true,
  publishedAt: true,
  category: { select: { name: true, slug: true } },
  // Aggregated in SQL. Selecting the chapter rows instead would transfer one row
  // per chapter of every story on the page just to count them in JavaScript.
  _count: { select: { chapters: true } },
} satisfies Prisma.StorySelect;

type AdminStoryRow = Prisma.StoryGetPayload<{
  select: typeof ADMIN_STORY_SELECT;
}>;

/** Published-chapter counts for a set of stories, keyed by story id. */
async function publishedChapterCounts(
  tx: Prisma.TransactionClient,
  storyIds: string[],
): Promise<Map<string, number>> {
  if (storyIds.length === 0) {
    return new Map();
  }

  const groups = await tx.chapter.groupBy({
    by: ["storyId"],
    where: { storyId: { in: storyIds }, status: "PUBLISHED" },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.storyId, group._count._all]));
}

function buildAdminStoryWhere(
  params: AdminStoryListParams,
): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = {};

  if (params.q) {
    const term = escapeLikeTerm(params.q);
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { author: { contains: term, mode: "insensitive" } },
      { slug: { contains: term, mode: "insensitive" } },
    ];
  }

  if (params.status !== "ALL") {
    where.status = params.status;
  }

  if (params.category) {
    where.category = { slug: params.category };
  }

  return where;
}

function toRow(
  row: AdminStoryRow,
  publishedCounts: Map<string, number>,
): AdminStoryListRow {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    author: row.author,
    status: row.status,
    featured: row.featured,
    coverImage: row.coverImage,
    category: row.category,
    chapterCount: row._count.chapters,
    publishedChapterCount: publishedCounts.get(row.id) ?? 0,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

/**
 * One paginated page of the admin catalogue, newest-edited first by default.
 * Count and page run in one transaction so the clamp and the rows share a
 * snapshot.
 */
export async function queryAdminStoryList(
  params: AdminStoryListParams,
): Promise<AdminStoryListResult> {
  const where = buildAdminStoryWhere(params);

  return prisma.$transaction(async (tx) => {
    const total = await tx.story.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / ADMIN_STORY_PAGE_SIZE));
    const page = clampPage(params.page, pageCount);

    const rows =
      total === 0
        ? []
        : await tx.story.findMany({
            where,
            select: ADMIN_STORY_SELECT,
            orderBy: ADMIN_STORY_ORDER[params.sort],
            skip: (page - 1) * ADMIN_STORY_PAGE_SIZE,
            take: ADMIN_STORY_PAGE_SIZE,
          });

    const storyIds = rows.map((row) => row.id);
    const publishedCounts = await publishedChapterCounts(tx, storyIds);

    return {
      stories: rows.map((row) => toRow(row, publishedCounts)),
      total,
      page,
      pageCount,
      pageSize: ADMIN_STORY_PAGE_SIZE,
    };
  });
}

export interface AdminStoryDetail {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  shortDescription: string | null;
  description: string | null;
  coverImage: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  featured: boolean;
  categoryId: string | null;
  tagIds: string[];
  chapterCount: number;
  publishedChapterCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ADMIN_STORY_DETAIL_SELECT = {
  id: true,
  title: true,
  slug: true,
  author: true,
  shortDescription: true,
  description: true,
  coverImage: true,
  status: true,
  featured: true,
  categoryId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  storyTags: { select: { tagId: true } },
  // Counted in SQL rather than by selecting every chapter status and filtering
  // them in JavaScript. Prisma allows one key per relation in `_count`, so the
  // published total comes from a separate aggregate below, in the same snapshot.
  _count: { select: { chapters: true } },
} satisfies Prisma.StorySelect;

/** One story with everything the admin editor needs. Never a password/secret. */
export async function getAdminStoryById(
  id: string,
): Promise<AdminStoryDetail | null> {
  // One transaction so the story row and the chapter aggregate cannot disagree.
  const [row, publishedChapterCount] = await prisma.$transaction([
    prisma.story.findUnique({
      where: { id },
      select: ADMIN_STORY_DETAIL_SELECT,
    }),
    prisma.chapter.count({
      where: { storyId: id, status: "PUBLISHED" },
    }),
  ]);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    author: row.author,
    shortDescription: row.shortDescription,
    description: row.description,
    coverImage: row.coverImage,
    status: row.status,
    featured: row.featured,
    categoryId: row.categoryId,
    tagIds: row.storyTags.map((entry) => entry.tagId),
    chapterCount: row._count.chapters,
    publishedChapterCount,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface StoryFormOptions {
  categories: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string }>;
}

/** Categories and tags for the story editor's selects. All statuses. */
export async function getStoryFormOptions(): Promise<StoryFormOptions> {
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { categories, tags };
}
