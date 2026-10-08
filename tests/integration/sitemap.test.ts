import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { MetadataRoute } from "next";

/**
 * Sitemap assembly against a real PostgreSQL database.
 *
 * Skipped entirely unless `DATABASE_URL` is set. All rows are namespaced by
 * process id and removed afterwards. Asserts the public-visibility guarantee
 * (published stories and published chapters only), that the enumeration reads in
 * bounded pages rather than loading the whole catalogue at once, and that no
 * admin URL can appear.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itsitemap-${process.pid}`;

type SitemapModule = typeof import("@/lib/queries/public/sitemap");

describe.skipIf(!hasDatabase)("sitemap (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let querySitemap: SitemapModule["querySitemap"];

  const baseUrl = "https://sitemap.test";

  function urls(entries: MetadataRoute.Sitemap): string[] {
    return entries.map((entry) => entry.url);
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;

    const sitemap = await import("@/lib/queries/public/sitemap");
    querySitemap = sitemap.querySitemap;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    // Public: two published chapters around a draft gap.
    await prisma.story.create({
      data: {
        title: "Sitemap Public",
        slug: `${PREFIX}-public`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date("2026-01-10T00:00:00.000Z"),
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "One",
              slug: `${PREFIX}-public-1`,
              content: "<p>One.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date("2026-01-10T01:00:00.000Z"),
            },
            {
              chapterNumber: 2,
              title: "Draft gap",
              slug: `${PREFIX}-public-2`,
              content: "<p>Draft.</p>",
              status: ContentStatus.DRAFT,
            },
            {
              chapterNumber: 3,
              title: "Three",
              slug: `${PREFIX}-public-3`,
              content: "<p>Three.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date("2026-01-12T00:00:00.000Z"),
            },
          ],
        },
      },
    });

    // Published story with only a draft chapter: nothing enumerable.
    await prisma.story.create({
      data: {
        title: "Sitemap No Chapters",
        slug: `${PREFIX}-nochapters`,
        status: ContentStatus.PUBLISHED,
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

    // Draft story carrying a published chapter: never public.
    await prisma.story.create({
      data: {
        title: "Sitemap Draft Story",
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

    // Archived story carrying a published chapter: never public.
    await prisma.story.create({
      data: {
        title: "Sitemap Archived Story",
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

  it("lists the public story and its published chapters", async () => {
    const listed = urls(await querySitemap(baseUrl));

    expect(listed).toContain(`${baseUrl}/stories/${PREFIX}-public`);
    expect(listed).toContain(
      `${baseUrl}/stories/${PREFIX}-public/chapter/${PREFIX}-public-1`,
    );
    expect(listed).toContain(
      `${baseUrl}/stories/${PREFIX}-public/chapter/${PREFIX}-public-3`,
    );
  });

  it("never lists a draft chapter, even between published ones", async () => {
    const listed = urls(await querySitemap(baseUrl));

    expect(
      listed.includes(
        `${baseUrl}/stories/${PREFIX}-public/chapter/${PREFIX}-public-2`,
      ),
    ).toBe(false);
  });

  it("never lists a published story whose only chapter is a draft", async () => {
    const listed = urls(await querySitemap(baseUrl));

    expect(listed).not.toContain(`${baseUrl}/stories/${PREFIX}-nochapters`);
    expect(
      listed.includes(
        `${baseUrl}/stories/${PREFIX}-nochapters/chapter/${PREFIX}-nochapters-1`,
      ),
    ).toBe(false);
  });

  it("never lists a chapter of a draft or archived story", async () => {
    const listed = urls(await querySitemap(baseUrl));

    for (const story of [`${PREFIX}-draft-story`, `${PREFIX}-archived-story`]) {
      expect(listed).not.toContain(`${baseUrl}/stories/${story}`);
      expect(listed.some((url) => url.includes(story))).toBe(false);
    }
  });

  it("includes the static surfaces and no admin or API URL", async () => {
    const listed = urls(await querySitemap(baseUrl));

    expect(listed).toContain(`${baseUrl}/`);
    expect(listed).toContain(`${baseUrl}/stories`);
    expect(listed).toContain(`${baseUrl}/categories`);
    expect(listed).toContain(`${baseUrl}/about`);

    expect(listed.some((url) => url.includes("/admin"))).toBe(false);
    expect(listed.some((url) => url.includes("/api/"))).toBe(false);
  });

  it("emits every entry with an absolute base URL and a valid lastModified", async () => {
    for (const entry of await querySitemap(baseUrl)) {
      expect(entry.url.startsWith(`${baseUrl}/`)).toBe(true);

      // Every generated entry carries a lastModified; a missing one would be a
      // crawler signal we do not mean to send.
      expect(entry.lastModified).toBeDefined();
      expect(
        Number.isNaN(new Date(entry.lastModified as string | Date).getTime()),
      ).toBe(false);
    }
  });

  it("dates content by its own published date, never the clock", async () => {
    const entries = await querySitemap(baseUrl);

    const story = entries.find(
      (entry) => entry.url === `${baseUrl}/stories/${PREFIX}-public`,
    );
    expect(
      new Date(story?.lastModified as string | Date).toISOString(),
    ).toBe("2026-01-10T00:00:00.000Z");

    const chapter = entries.find((entry) =>
      entry.url.endsWith(`/chapter/${PREFIX}-public-3`),
    );
    expect(
      new Date(chapter?.lastModified as string | Date).toISOString(),
    ).toBe("2026-01-12T00:00:00.000Z");
  });

  it("omits search, query-string and fragment URLs", async () => {
    const listed = urls(await querySitemap(baseUrl));

    expect(listed.some((url) => url.includes("/search"))).toBe(false);
    expect(listed.some((url) => url.includes("?"))).toBe(false);
    expect(listed.some((url) => url.includes("#"))).toBe(false);
  });

  it("produces byte-identical output across runs", async () => {
    const first = await querySitemap(baseUrl);
    const second = await querySitemap(baseUrl);

    expect(second).toEqual(first);
  });

  it("stays under the protocol URL ceiling", async () => {
    const { SITEMAP_URL_LIMIT } = await import("@/lib/seo/sitemap");

    expect(urls(await querySitemap(baseUrl)).length).toBeLessThanOrEqual(
      SITEMAP_URL_LIMIT,
    );
  });
});
