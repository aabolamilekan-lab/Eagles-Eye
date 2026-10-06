import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Catalogue listing against a real PostgreSQL database.
 *
 * Skipped entirely unless `DATABASE_URL` is set. Everything the suite creates is
 * namespaced by process id and removed afterwards. Asserts the public-visibility
 * guarantee and each filter the `/stories` page exposes.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itstory-${process.pid}`;

type StoryListModule = typeof import("@/lib/queries/public/story-list");

interface CreateStoryInput {
  suffix: string;
  title: string;
  shortDescription: string;
  categoryId: string;
  tagIds: string[];
  views: number;
  publishedAt: Date;
  storyStatus: ContentStatus;
  chapterStatus: ContentStatus;
}

describe.skipIf(!hasDatabase)("catalogue listing (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let queryStoryList: StoryListModule["queryStoryList"];
  let categoryA = "";
  let categoryPage = "";
  let epicId = "";
  let magicId = "";

  async function createStory(input: CreateStoryInput): Promise<void> {
    const slug = `${PREFIX}-${input.suffix}`;
    await prisma.story.create({
      data: {
        title: input.title,
        slug,
        author: "Integration Author",
        shortDescription: input.shortDescription,
        status: input.storyStatus,
        views: input.views,
        publishedAt: input.publishedAt,
        category: { connect: { id: input.categoryId } },
        storyTags: {
          create: input.tagIds.map((tagId) => ({
            tag: { connect: { id: tagId } },
          })),
        },
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: `${input.title} — Chapter One`,
              slug: `${slug}-chapter-1`,
              content: "<p>Chapter body.</p>",
              status: input.chapterStatus,
              publishedAt: input.publishedAt,
            },
          ],
        },
      },
      select: { id: true },
    });
  }

  const base = {
    q: "",
    category: null as string | null,
    tags: [] as string[],
    sort: "recent" as const,
    page: 1,
  };

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;

    const listing = await import("@/lib/queries/public/story-list");
    queryStoryList = listing.queryStoryList;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    const a = await prisma.category.create({
      data: { name: "Integration Cat A", slug: `${PREFIX}-a` },
      select: { id: true },
    });
    categoryA = a.id;

    const p = await prisma.category.create({
      data: { name: "Integration Cat P", slug: `${PREFIX}-p` },
      select: { id: true },
    });
    categoryPage = p.id;

    const epic = await prisma.tag.create({
      data: { name: "Integration Epic", slug: `${PREFIX}-epic` },
      select: { id: true },
    });
    epicId = epic.id;

    const magic = await prisma.tag.create({
      data: { name: "Integration Magic", slug: `${PREFIX}-magic` },
      select: { id: true },
    });
    magicId = magic.id;

    await createStory({
      suffix: "alpha",
      title: "Alpha Chronicle",
      shortDescription: "A study of quokkas.",
      categoryId: categoryA,
      tagIds: [epicId],
      views: 5,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    await createStory({
      suffix: "beta",
      title: "Beta Chronicle",
      shortDescription: "Another tale.",
      categoryId: categoryA,
      tagIds: [epicId, magicId],
      views: 50,
      publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Published story whose only chapter is a draft: not public.
    await createStory({
      suffix: "draft-chapter",
      title: "Hidden Chronicle",
      shortDescription: "No published chapters.",
      categoryId: categoryA,
      tagIds: [],
      views: 999,
      publishedAt: new Date("2026-03-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.DRAFT,
    });

    // Draft story with a published chapter: not public.
    await createStory({
      suffix: "draft-story",
      title: "Unfinished Chronicle",
      shortDescription: "Not yet published.",
      categoryId: categoryA,
      tagIds: [],
      views: 999,
      publishedAt: new Date("2026-03-02T00:00:00.000Z"),
      storyStatus: ContentStatus.DRAFT,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Archived story: not public.
    await createStory({
      suffix: "archived",
      title: "Retired Chronicle",
      shortDescription: "Retired from the catalogue.",
      categoryId: categoryA,
      tagIds: [],
      views: 999,
      publishedAt: new Date("2026-03-03T00:00:00.000Z"),
      storyStatus: ContentStatus.ARCHIVED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Pagination group: 13 published stories in their own category.
    for (let index = 1; index <= 13; index += 1) {
      await createStory({
        suffix: `page-${String(index).padStart(2, "0")}`,
        title: `Page Story ${String(index).padStart(2, "0")}`,
        shortDescription: "Pagination fixture.",
        categoryId: categoryPage,
        tagIds: [],
        views: 13 - index,
        publishedAt: new Date(Date.UTC(2026, 0, index)),
        storyStatus: ContentStatus.PUBLISHED,
        chapterStatus: ContentStatus.PUBLISHED,
      });
    }
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("lists only published stories that have a published chapter", async () => {
    const result = await queryStoryList({ ...base, category: `${PREFIX}-a` });
    expect(result.total).toBe(2);
    expect(result.stories.map((story) => story.slug).sort()).toEqual([
      `${PREFIX}-alpha`,
      `${PREFIX}-beta`,
    ]);
  });

  it("orders by recency and by popularity", async () => {
    const recent = await queryStoryList({
      ...base,
      category: `${PREFIX}-a`,
      sort: "recent",
    });
    expect(recent.stories.map((story) => story.slug)).toEqual([
      `${PREFIX}-beta`,
      `${PREFIX}-alpha`,
    ]);

    const popular = await queryStoryList({
      ...base,
      category: `${PREFIX}-a`,
      sort: "popular",
    });
    expect(popular.stories.map((story) => story.slug)).toEqual([
      `${PREFIX}-beta`,
      `${PREFIX}-alpha`,
    ]);
  });

  it("filters by category and returns an empty result for an unknown one", async () => {
    const matched = await queryStoryList({ ...base, category: `${PREFIX}-a` });
    expect(matched.total).toBe(2);

    const missing = await queryStoryList({
      ...base,
      category: `${PREFIX}-missing`,
    });
    expect(missing.total).toBe(0);
    expect(missing.stories).toHaveLength(0);
    expect(missing.page).toBe(1);
    expect(missing.pageCount).toBe(1);
  });

  it("matches search terms case-insensitively", async () => {
    const result = await queryStoryList({
      ...base,
      q: "QUOKKAS",
      category: `${PREFIX}-a`,
    });
    expect(result.total).toBe(1);
    expect(result.stories[0]?.slug).toBe(`${PREFIX}-alpha`);
  });

  it("treats a percent sign as a literal, not a wildcard", async () => {
    const result = await queryStoryList({
      ...base,
      q: "%",
      category: `${PREFIX}-a`,
    });
    expect(result.total).toBe(0);
  });

  it("combines multiple tags with AND semantics", async () => {
    const single = await queryStoryList({
      ...base,
      category: `${PREFIX}-a`,
      tags: [`${PREFIX}-epic`],
    });
    expect(single.total).toBe(2);

    const both = await queryStoryList({
      ...base,
      category: `${PREFIX}-a`,
      tags: [`${PREFIX}-epic`, `${PREFIX}-magic`],
    });
    expect(both.total).toBe(1);
    expect(both.stories[0]?.slug).toBe(`${PREFIX}-beta`);
  });

  it("paginates and clamps a page beyond the last", async () => {
    const first = await queryStoryList({ ...base, category: `${PREFIX}-p` });
    expect(first.total).toBe(13);
    expect(first.pageCount).toBe(2);
    expect(first.page).toBe(1);
    expect(first.stories).toHaveLength(12);

    const second = await queryStoryList({
      ...base,
      category: `${PREFIX}-p`,
      page: 2,
    });
    expect(second.page).toBe(2);
    expect(second.stories).toHaveLength(1);

    const beyond = await queryStoryList({
      ...base,
      category: `${PREFIX}-p`,
      page: 999999,
    });
    expect(beyond.page).toBe(2);
    expect(beyond.stories).toHaveLength(1);
  });
});
