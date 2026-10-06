import { prisma } from "@/lib/db";
import { PUBLIC_STORY_WHERE } from "@/lib/queries/public/story-filter";

/**
 * Admin category and tag reads.
 *
 * Deliberately uncached and status-agnostic: the admin surface must see
 * categories and tags attached only to drafts, unlike
 * `src/lib/queries/public/`. These functions are never used by a public page.
 * Counts are computed with `groupBy` so listing every category or tag does not
 * pull one row per attached story.
 */

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Every story referencing the category, whatever its status. */
  storyCount: number;
  /** Stories that are publicly visible with this category. */
  publishedStoryCount: number;
  updatedAt: Date;
}

export interface AdminTagRow {
  id: string;
  name: string;
  slug: string;
  storyCount: number;
  publishedStoryCount: number;
}

async function publishedCountsByCategory(): Promise<Map<string, number>> {
  const groups = await prisma.story.groupBy({
    by: ["categoryId"],
    where: { ...PUBLIC_STORY_WHERE, categoryId: { not: null } },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const group of groups) {
    if (group.categoryId) {
      counts.set(group.categoryId, group._count._all);
    }
  }
  return counts;
}

async function publishedCountsByTag(): Promise<Map<string, number>> {
  const groups = await prisma.storyTag.groupBy({
    by: ["tagId"],
    where: { story: PUBLIC_STORY_WHERE },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const group of groups) {
    counts.set(group.tagId, group._count._all);
  }
  return counts;
}

export async function queryAdminCategoryList(): Promise<AdminCategoryRow[]> {
  const [rows, published] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        updatedAt: true,
        _count: { select: { stories: true } },
      },
      orderBy: { name: "asc" },
    }),
    publishedCountsByCategory(),
  ]);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    storyCount: row._count.stories,
    publishedStoryCount: published.get(row.id) ?? 0,
    updatedAt: row.updatedAt,
  }));
}

export interface AdminCategoryDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  storyCount: number;
  publishedStoryCount: number;
}

export async function getAdminCategoryById(
  id: string,
): Promise<AdminCategoryDetail | null> {
  const row = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { stories: true } },
    },
  });

  if (!row) {
    return null;
  }

  const published = await publishedCountsByCategory();

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    storyCount: row._count.stories,
    publishedStoryCount: published.get(row.id) ?? 0,
  };
}

export async function queryAdminTagList(): Promise<AdminTagRow[]> {
  const [rows, published] = await Promise.all([
    prisma.tag.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { storyTags: true } },
      },
      orderBy: { name: "asc" },
    }),
    publishedCountsByTag(),
  ]);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    storyCount: row._count.storyTags,
    publishedStoryCount: published.get(row.id) ?? 0,
  }));
}

export interface AdminTagDetail {
  id: string;
  name: string;
  slug: string;
  storyCount: number;
  publishedStoryCount: number;
}

export async function getAdminTagById(
  id: string,
): Promise<AdminTagDetail | null> {
  const row = await prisma.tag.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { storyTags: true } },
    },
  });

  if (!row) {
    return null;
  }

  const published = await publishedCountsByTag();

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    storyCount: row._count.storyTags,
    publishedStoryCount: published.get(row.id) ?? 0,
  };
}
