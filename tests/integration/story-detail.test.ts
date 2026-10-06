import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Story detail against a real PostgreSQL database.
 *
 * Skipped entirely unless `DATABASE_URL` is set. All rows are namespaced by
 * process id and removed afterwards. Asserts the public-visibility guarantee for
 * a single story, that draft chapters never reach the reader, and that related
 * stories respect the same predicate.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itdetail-${process.pid}`;

type StoryDetailModule = typeof import("@/lib/queries/public/story-detail");

describe.skipIf(!hasDatabase)("story detail (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let queryPublishedStoryDetail: StoryDetailModule["queryPublishedStoryDetail"];
  let categoryId = "";
  let tagId = "";

  async function load(slug: string) {
    const page = await queryPublishedStoryDetail(slug);
    if (!page) {
      throw new Error(`expected a published story detail for ${slug}`);
    }
    return page;
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;

    const detail = await import("@/lib/queries/public/story-detail");
    queryPublishedStoryDetail = detail.queryPublishedStoryDetail;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    const category = await prisma.category.create({
      data: { name: "Detail Category", slug: `${PREFIX}-cat` },
      select: { id: true },
    });
    categoryId = category.id;

    const tag = await prisma.tag.create({
      data: { name: "Detail Tag", slug: `${PREFIX}-tag` },
      select: { id: true },
    });
    tagId = tag.id;

    // Primary story: published chapters 1 and 3, with a draft chapter 2 between.
    await prisma.story.create({
      data: {
        title: "Detail Primary",
        slug: `${PREFIX}-primary`,
        author: "Detail Author",
        shortDescription: "The primary fixture.",
        description: "<p>The primary body.</p>",
        status: ContentStatus.PUBLISHED,
        views: 12,
        publishedAt: new Date("2026-01-10T00:00:00.000Z"),
        categoryId,
        storyTags: { create: [{ tag: { connect: { id: tagId } } }] },
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "One",
              slug: `${PREFIX}-primary-1`,
              content: "<p>One.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date("2026-01-10T01:00:00.000Z"),
            },
            {
              chapterNumber: 2,
              title: "Two",
              slug: `${PREFIX}-primary-2`,
              content: "<p>Draft two.</p>",
              status: ContentStatus.DRAFT,
            },
            {
              chapterNumber: 3,
              title: "Three",
              slug: `${PREFIX}-primary-3`,
              content: "<p>Three.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date("2026-01-12T00:00:00.000Z"),
            },
          ],
        },
      },
    });

    // Related fixture: same category, published.
    await prisma.story.create({
      data: {
        title: "Detail Sibling",
        slug: `${PREFIX}-sibling`,
        shortDescription: "The sibling fixture.",
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
        categoryId,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Sibling",
              slug: `${PREFIX}-sibling-1`,
              content: "<p>Sibling.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date("2026-02-01T00:00:00.000Z"),
            },
          ],
        },
      },
    });

    // Published story whose only chapter is a draft: identifiable, not readable.
    await prisma.story.create({
      data: {
        title: "Detail No Chapters",
        slug: `${PREFIX}-nochapters`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date("2026-03-01T00:00:00.000Z"),
        categoryId,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Hidden",
              slug: `${PREFIX}-nochapters-1`,
              content: "<p>Hidden.</p>",
              status: ContentStatus.DRAFT,
            },
          ],
        },
      },
    });

    // Draft story with a published chapter: not public at all.
    await prisma.story.create({
      data: {
        title: "Detail Draft",
        slug: `${PREFIX}-draft`,
        status: ContentStatus.DRAFT,
        categoryId,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Draft",
              slug: `${PREFIX}-draft-1`,
              content: "<p>Draft.</p>",
              status: ContentStatus.PUBLISHED,
            },
          ],
        },
      },
    });
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

  it("returns a published story with only its published chapters, ascending", async () => {
    const { story } = await load(`${PREFIX}-primary`);

    expect(story.slug).toBe(`${PREFIX}-primary`);
    expect(story.author).toBe("Detail Author");
    expect(story.views).toBe(12);
    expect(story.chapterCount).toBe(2);
    expect(story.hasPublishedChapters).toBe(true);
    expect(story.chapters.map((chapter) => chapter.number)).toEqual([1, 3]);
    expect(story.chapters.map((chapter) => chapter.slug)).toEqual([
      `${PREFIX}-primary-1`,
      `${PREFIX}-primary-3`,
    ]);
    expect(story.tags.map((entry) => entry.slug)).toEqual([`${PREFIX}-tag`]);
  });

  it("returns null for a draft story and for an unknown slug", async () => {
    await expect(queryPublishedStoryDetail(`${PREFIX}-draft`)).resolves.toBeNull();
    await expect(
      queryPublishedStoryDetail(`${PREFIX}-missing`),
    ).resolves.toBeNull();
  });

  it("returns no chapters and no action for a story with no published chapters", async () => {
    const { story } = await load(`${PREFIX}-nochapters`);

    expect(story.hasPublishedChapters).toBe(false);
    expect(story.chapterCount).toBe(0);
    expect(story.chapters).toHaveLength(0);
  });

  it("offers published same-category related stories, never itself", async () => {
    const { relatedStories } = await load(`${PREFIX}-primary`);
    const slugs = relatedStories.map((story) => story.slug);

    expect(slugs).toContain(`${PREFIX}-sibling`);
    expect(slugs).not.toContain(`${PREFIX}-primary`);
    // Draft and chapter-less stories are excluded by the public predicate.
    expect(slugs).not.toContain(`${PREFIX}-draft`);
    expect(slugs).not.toContain(`${PREFIX}-nochapters`);
  });
});
