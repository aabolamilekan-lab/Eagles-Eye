import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Public category reads against a real PostgreSQL database.
 *
 * Skipped unless `DATABASE_URL` is set. `next/cache` is stubbed so the tagged
 * `unstable_cache` wrappers run their query directly, without a request context.
 * Asserts the public-visibility guarantee: a category is public as soon as it
 * holds at least one published story, whether or not that story has a published
 * chapter, and its count excludes drafts and archived stories (AGENTS.md
 * section 6).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itcat-${process.pid}`;

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

type CategoriesModule = typeof import("@/lib/queries/public/categories");

describe.skipIf(!hasDatabase)("public categories (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let categories: CategoriesModule;
  let publicSlug = "";
  let draftOnlySlug = "";
  let draftChapterSlug = "";
  let emptySlug = "";

  async function createStory(input: {
    suffix: string;
    title: string;
    categoryId?: string;
    storyStatus: ContentStatus;
    chapterStatus: ContentStatus;
  }): Promise<void> {
    const slug = `${PREFIX}-${input.suffix}`;
    await prisma.story.create({
      data: {
        title: input.title,
        slug,
        status: input.storyStatus,
        publishedAt:
          input.storyStatus === ContentStatus.PUBLISHED ? new Date() : null,
        ...(input.categoryId
          ? { category: { connect: { id: input.categoryId } } }
          : {}),
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: `${input.title} — One`,
              slug: `${slug}-1`,
              content: "<p>Body.</p>",
              status: input.chapterStatus,
              publishedAt:
                input.chapterStatus === ContentStatus.PUBLISHED
                  ? new Date()
                  : null,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    categories = await import("@/lib/queries/public/categories");

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    const publicCategory = await prisma.category.create({
      data: {
        name: `${PREFIX} Public`,
        slug: `${PREFIX}-public`,
        description: "Visible.",
      },
      select: { id: true },
    });
    publicSlug = `${PREFIX}-public`;

    const draftOnlyCategory = await prisma.category.create({
      data: { name: `${PREFIX} Draft Only`, slug: `${PREFIX}-draft-only` },
      select: { id: true },
    });
    draftOnlySlug = `${PREFIX}-draft-only`;

    const draftChapterCategory = await prisma.category.create({
      data: {
        name: `${PREFIX} Draft Chapter`,
        slug: `${PREFIX}-draft-chapter`,
      },
      select: { id: true },
    });
    draftChapterSlug = `${PREFIX}-draft-chapter`;

    const emptyCategory = await prisma.category.create({
      data: { name: `${PREFIX} Empty`, slug: `${PREFIX}-empty` },
      select: { id: true },
    });
    emptySlug = `${PREFIX}-empty`;

    // One published story (public) and one draft (excluded from the count).
    await createStory({
      suffix: "public-live",
      title: "Public Live",
      categoryId: publicCategory.id,
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });
    await createStory({
      suffix: "public-draft",
      title: "Public Draft",
      categoryId: publicCategory.id,
      storyStatus: ContentStatus.DRAFT,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Draft story only, so the category is not public.
    await createStory({
      suffix: "draft-only",
      title: "Draft Only Story",
      categoryId: draftOnlyCategory.id,
      storyStatus: ContentStatus.DRAFT,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Published story with a draft chapter only: the story is public, so the
    // category is public too, even though nothing is readable yet.
    await createStory({
      suffix: "draft-chapter",
      title: "Draft Chapter Story",
      categoryId: draftChapterCategory.id,
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.DRAFT,
    });

    // `emptyCategory` intentionally has no stories.
    void emptyCategory;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("resolves a category that holds a published, readable story", async () => {
    const category = await categories.getPublishedCategoryBySlug(publicSlug);
    expect(category?.name).toBe(`${PREFIX} Public`);
    expect(category?.description).toBe("Visible.");
  });

  it("hides a category whose only stories are drafts", async () => {
    expect(await categories.getPublishedCategoryBySlug(draftOnlySlug)).toBeNull();
  });

  it("resolves a category whose published story has no published chapter", async () => {
    const category = await categories.getPublishedCategoryBySlug(draftChapterSlug);
    expect(category?.name).toBe(`${PREFIX} Draft Chapter`);
  });

  it("hides an empty category and an unknown slug", async () => {
    expect(await categories.getPublishedCategoryBySlug(emptySlug)).toBeNull();
    expect(
      await categories.getPublishedCategoryBySlug(`${PREFIX}-missing`),
    ).toBeNull();
  });

  it("returns published categories on one bound page", async () => {
    const page = await categories.getPublishedCategoryPage(1);
    const slugs = page.categories.map((entry) => entry.slug);

    expect(slugs).toContain(publicSlug);
    expect(slugs).toContain(draftChapterSlug);
    expect(slugs).not.toContain(draftOnlySlug);
    expect(slugs).not.toContain(emptySlug);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(categories.CATEGORY_PAGE_SIZE);
  });

  it("counts only publicly visible stories per category", async () => {
    const page = await categories.getPublishedCategoryPage(1);
    const entry = page.categories.find((row) => row.slug === publicSlug);
    expect(entry?.storyCount).toBe(1);

    const chapterless = page.categories.find((row) => row.slug === draftChapterSlug);
    expect(chapterless?.storyCount).toBe(1);
  });

  it("offers only published categories as filter options", async () => {
    const options = await categories.getPublishedCategoryOptions();
    const slugs = options.map((option) => option.slug);
    expect(slugs).toContain(publicSlug);
    expect(slugs).toContain(draftChapterSlug);
    expect(slugs).not.toContain(draftOnlySlug);
    expect(slugs).not.toContain(emptySlug);
  });
});
