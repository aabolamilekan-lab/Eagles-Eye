import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PUBLIC_STORY_WHERE } from "@/lib/queries/public/stories";
import { clampPage } from "@/lib/validation/story";

/**
 * Published category reads.
 *
 * A category is public only when it holds at least one published story, and its
 * count includes published stories only. Draft-only categories and draft
 * volumes never surface on the reader side (AGENTS.md section 6).
 */

export const PUBLIC_CATEGORIES_TAG = "public:categories";

export interface CategorySummary {
  name: string;
  slug: string;
  description: string | null;
  storyCount: number;
}

const CATEGORY_SELECT = {
  name: true,
  slug: true,
  description: true,
  _count: { select: { stories: { where: PUBLIC_STORY_WHERE } } },
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;

function toCategorySummary(row: CategoryRow): CategorySummary {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description,
    storyCount: row._count.stories,
  };
}

async function queryCategories(limit: number): Promise<CategorySummary[]> {
  const rows = await prisma.category.findMany({
    where: { stories: { some: PUBLIC_STORY_WHERE } },
    select: CATEGORY_SELECT,
    orderBy: { name: "asc" },
    take: limit,
  });

  return rows.map(toCategorySummary);
}

/** One bound page of the public category index. */
export const CATEGORY_PAGE_SIZE = 24;

export interface CategoryPage {
  categories: CategorySummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

async function queryCategoryPage(requestedPage: number): Promise<CategoryPage> {
  const where = { stories: { some: PUBLIC_STORY_WHERE } } satisfies Prisma.CategoryWhereInput;

  return prisma.$transaction(async (tx) => {
    const total = await tx.category.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE));
    const page = clampPage(requestedPage, pageCount);

    const rows =
      total === 0
        ? []
        : await tx.category.findMany({
            where,
            select: CATEGORY_SELECT,
            orderBy: { name: "asc" },
            skip: (page - 1) * CATEGORY_PAGE_SIZE,
            take: CATEGORY_PAGE_SIZE,
          });

    return {
      categories: rows.map(toCategorySummary),
      total,
      page,
      pageCount,
      pageSize: CATEGORY_PAGE_SIZE,
    };
  });
}

async function queryCategoryCount(): Promise<number> {
  return prisma.category.count({ where: { stories: { some: PUBLIC_STORY_WHERE } } });
}

export interface CategoryDetail {
  name: string;
  slug: string;
  description: string | null;
}

const CATEGORY_DETAIL_SELECT = {
  name: true,
  slug: true,
  description: true,
} satisfies Prisma.CategorySelect;

/**
 * Resolve one category that holds at least one published story.
 *
 * The `some` predicate is the same visibility rule as the catalogue: a category
 * with only drafts or archived stories does not exist for readers, so its page
 * returns the same `notFound()` as an unknown slug (AGENTS.md section 6).
 */
async function queryPublishedCategory(
  slug: string,
): Promise<CategoryDetail | null> {
  const row = await prisma.category.findFirst({
    where: { slug, stories: { some: PUBLIC_STORY_WHERE } },
    select: CATEGORY_DETAIL_SELECT,
  });

  return row ?? null;
}

/** Option cap for the catalogue filter; far above any real category count. */
const MAX_CATEGORY_OPTIONS = 50;

async function queryCategoryOptions(): Promise<CategorySummary[]> {
  return queryCategories(MAX_CATEGORY_OPTIONS);
}

const REVALIDATE_SECONDS = 300;

/**
 * Categories holding at least one published story, bounded by `limit`.
 *
 * Uncached so the sitemap builder can be exercised in integration tests.
 */
export async function queryPublishedCategories(
  limit: number,
): Promise<CategorySummary[]> {
  return queryCategories(limit);
}

export const getPublishedCategories = unstable_cache(
  async (limit: number) => queryCategories(limit),
  ["public:categories"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_CATEGORIES_TAG] },
);

/**
 * Categories holding at least one published story, for the `/stories` filter.
 * Same visibility rule as the public category pages.
 */
export const getPublishedCategoryOptions = unstable_cache(
  async () => queryCategoryOptions(),
  ["public:category-options"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_CATEGORIES_TAG] },
);

export const getPublishedCategoryCount = unstable_cache(
  async () => queryCategoryCount(),
  ["public:category-count"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_CATEGORIES_TAG] },
);

/**
 * One category that holds at least one published story, by slug.
 *
 * Cached per slug and tagged with the category tag, so a rename or delete in the
 * admin invalidates it (AGENTS.md section 6).
 */
export const getPublishedCategoryBySlug = unstable_cache(
  async (slug: string) => queryPublishedCategory(slug),
  ["public:category-detail"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_CATEGORIES_TAG] },
);

/** One bound page of the public category index, cached per page number. */
export const getPublishedCategoryPage = unstable_cache(
  async (page: number) => queryCategoryPage(page),
  ["public:category-page"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_CATEGORIES_TAG] },
);
