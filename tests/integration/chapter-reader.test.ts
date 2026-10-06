import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Chapter reader against a real PostgreSQL database.
 *
 * Skipped entirely unless `DATABASE_URL` is set. All rows are namespaced by
 * process id and removed afterwards. Asserts the public-visibility guarantee
 * for a single chapter, that drafts are never readable or offered as siblings,
 * and that unpublished volume does not leak through positioning.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itchapter-${process.pid}`;

type ChapterReaderModule = typeof import("@/lib/queries/public/chapters");

describe.skipIf(!hasDatabase)("chapter reader (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let queryPublishedChapterReader: ChapterReaderModule["queryPublishedChapterReader"];

  async function load(storySlug: string, chapterSlug: string) {
    const reader = await queryPublishedChapterReader(storySlug, chapterSlug);
    if (!reader) {
      throw new Error(`expected a reader for ${storySlug}/${chapterSlug}`);
    }
    return reader;
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;

    const chapters = await import("@/lib/queries/public/chapters");
    queryPublishedChapterReader = chapters.queryPublishedChapterReader;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    // Primary: published chapters 1 and 3, with a draft chapter 2 between.
    await prisma.story.create({
      data: {
        title: "Reader Primary",
        slug: `${PREFIX}-primary`,
        author: "Reader Author",
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date("2026-01-10T00:00:00.000Z"),
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

    // Published story whose only chapter is a draft: nothing is readable.
    await prisma.story.create({
      data: {
        title: "Reader No Chapters",
        slug: `${PREFIX}-nochapters`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date("2026-03-01T00:00:00.000Z"),
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

    // Draft story with a published chapter: never public.
    await prisma.story.create({
      data: {
        title: "Reader Draft Story",
        slug: `${PREFIX}-draft-story`,
        status: ContentStatus.DRAFT,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Published In Draft",
              slug: `${PREFIX}-draft-story-1`,
              content: "<p>Published.</p>",
              status: ContentStatus.PUBLISHED,
            },
          ],
        },
      },
    });

    // Archived story with a published chapter: never public.
    await prisma.story.create({
      data: {
        title: "Reader Archived Story",
        slug: `${PREFIX}-archived-story`,
        status: ContentStatus.ARCHIVED,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Published In Archive",
              slug: `${PREFIX}-archived-story-1`,
              content: "<p>Published.</p>",
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
    await prisma.$disconnect();
  });

  it("returns the first published chapter with no previous and no draft volume", async () => {
    const reader = await load(`${PREFIX}-primary`, `${PREFIX}-primary-1`);

    expect(reader.chapter.title).toBe("One");
    expect(reader.chapter.content).toBe("<p>One.</p>");
    expect(reader.story.author).toBe("Reader Author");
    expect(reader.currentNumber).toBe(1);
    expect(reader.totalCount).toBe(2);
    expect(reader.previous).toBeNull();
    expect(reader.next).toEqual({ slug: `${PREFIX}-primary-3`, title: "Three" });
    expect(reader.chapters.map((chapter) => chapter.number)).toEqual([1, 2]);
    expect(reader.chapters.map((chapter) => chapter.slug)).toEqual([
      `${PREFIX}-primary-1`,
      `${PREFIX}-primary-3`,
    ]);
    expect(reader.chapters.map((chapter) => chapter.isCurrent)).toEqual([
      true,
      false,
    ]);
  });

  it("returns the last published chapter with a previous and no next", async () => {
    const reader = await load(`${PREFIX}-primary`, `${PREFIX}-primary-3`);

    expect(reader.currentNumber).toBe(2);
    expect(reader.totalCount).toBe(2);
    expect(reader.previous).toEqual({
      slug: `${PREFIX}-primary-1`,
      title: "One",
    });
    expect(reader.next).toBeNull();
  });

  it("returns null for a draft chapter, a chapterless story, and unknown slugs", async () => {
    await expect(
      queryPublishedChapterReader(`${PREFIX}-primary`, `${PREFIX}-primary-2`),
    ).resolves.toBeNull();
    await expect(
      queryPublishedChapterReader(
        `${PREFIX}-nochapters`,
        `${PREFIX}-nochapters-1`,
      ),
    ).resolves.toBeNull();
    await expect(
      queryPublishedChapterReader(`${PREFIX}-missing`, `${PREFIX}-missing-1`),
    ).resolves.toBeNull();
  });

  it("returns null for a chapter of a draft or archived story", async () => {
    await expect(
      queryPublishedChapterReader(
        `${PREFIX}-draft-story`,
        `${PREFIX}-draft-story-1`,
      ),
    ).resolves.toBeNull();
    await expect(
      queryPublishedChapterReader(
        `${PREFIX}-archived-story`,
        `${PREFIX}-archived-story-1`,
      ),
    ).resolves.toBeNull();
  });
});
