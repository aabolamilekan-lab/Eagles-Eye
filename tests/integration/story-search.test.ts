import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Search query against a real PostgreSQL database.
 *
 * Skipped entirely unless `DATABASE_URL` is set. Everything the suite creates is
 * namespaced by process id and removed afterwards. Asserts the public-visibility
 * guarantee, each searchable field, the facets, and pagination.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itsearch-${process.pid}`;

type SearchModule = typeof import("@/lib/queries/public/search");

interface CreateStoryInput {
  suffix: string;
  title: string;
  author: string;
  shortDescription: string;
  description?: string;
  categoryId: string;
  tagIds: string[];
  views: number;
  publishedAt: Date;
  storyStatus: ContentStatus;
  chapterStatus: ContentStatus;
}

describe.skipIf(!hasDatabase)("story search (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let queryStorySearch: SearchModule["queryStorySearch"];
  let searchCat = "";
  let nauticalCat = "";
  let pageCat = "";
  let lighthouseTag = "";
  let beaconTag = "";

  async function createStory(input: CreateStoryInput): Promise<void> {
    const slug = `${PREFIX}-${input.suffix}`;
    await prisma.story.create({
      data: {
        title: input.title,
        slug,
        author: input.author,
        shortDescription: input.shortDescription,
        description: input.description ?? null,
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

  function slugs(stories: Array<{ slug: string }>): string[] {
    return stories.map((story) => story.slug).sort();
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;

    const search = await import("@/lib/queries/public/search");
    queryStorySearch = search.queryStorySearch;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    const catA = await prisma.category.create({
      data: { name: "Search Cat", slug: `${PREFIX}-cat` },
      select: { id: true },
    });
    searchCat = catA.id;

    const catN = await prisma.category.create({
      data: { name: "Nautical District", slug: `${PREFIX}-nautical` },
      select: { id: true },
    });
    nauticalCat = catN.id;

    const catP = await prisma.category.create({
      data: { name: "Seagull Bay", slug: `${PREFIX}-page` },
      select: { id: true },
    });
    pageCat = catP.id;

    const tagL = await prisma.tag.create({
      data: { name: "Lighthouse Legacy", slug: `${PREFIX}-lighthouse` },
      select: { id: true },
    });
    lighthouseTag = tagL.id;

    const tagB = await prisma.tag.create({
      data: { name: "Beacon Drills", slug: `${PREFIX}-beacon` },
      select: { id: true },
    });
    beaconTag = tagB.id;

    // Public. Matches "Lighthouse" through its tag name only.
    await createStory({
      suffix: "a",
      title: "The Keepers of Thorn",
      author: "Mara Voss",
      shortDescription: "A study of tides.",
      categoryId: searchCat,
      tagIds: [lighthouseTag],
      views: 5,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Public. Matches "Lighthouse" through its rich-text description, and
    // "Beacon" through its tag name.
    await createStory({
      suffix: "b",
      title: "Quiet Machines",
      author: "Ada Field",
      shortDescription: "Engineering notes.",
      description: "<p>Lighthouse blueprints in the margins.</p>",
      categoryId: searchCat,
      tagIds: [beaconTag],
      views: 50,
      publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Public. Matches "Lighthouse" and "Society" through its author.
    await createStory({
      suffix: "c",
      title: "Coastal Survey",
      author: "Lighthouse Society",
      shortDescription: "Mapping the shore.",
      categoryId: searchCat,
      tagIds: [],
      views: 10,
      publishedAt: new Date("2026-03-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Public. Matches "Beacon" through its title and "Lighthouse" through its tag.
    await createStory({
      suffix: "h",
      title: "Beacon Maintenance",
      author: "Rigger",
      shortDescription: "Nothing relevant.",
      categoryId: searchCat,
      tagIds: [lighthouseTag],
      views: 20,
      publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Draft story: never searchable.
    await createStory({
      suffix: "d",
      title: "Lighthouse Draft",
      author: "Nobody",
      shortDescription: "Unpublished.",
      categoryId: searchCat,
      tagIds: [lighthouseTag],
      views: 0,
      publishedAt: new Date("2026-04-01T00:00:00.000Z"),
      storyStatus: ContentStatus.DRAFT,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Published story with only a draft chapter: listed, not readable.
    await createStory({
      suffix: "e",
      title: "Lighthouse Ghost",
      author: "Nobody",
      shortDescription: "No published chapter.",
      categoryId: searchCat,
      tagIds: [],
      views: 0,
      publishedAt: new Date("2026-04-02T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.DRAFT,
    });

    // Archived story: never searchable.
    await createStory({
      suffix: "f",
      title: "Lighthouse Retired",
      author: "Nobody",
      shortDescription: "Archived.",
      categoryId: searchCat,
      tagIds: [],
      views: 0,
      publishedAt: new Date("2026-04-03T00:00:00.000Z"),
      storyStatus: ContentStatus.ARCHIVED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Public, no term in its own text: matches only through its category name.
    await createStory({
      suffix: "g",
      title: "District Report",
      author: "Surveyor",
      shortDescription: "Nothing relevant.",
      categoryId: nauticalCat,
      tagIds: [],
      views: 0,
      publishedAt: new Date("2026-05-01T00:00:00.000Z"),
      storyStatus: ContentStatus.PUBLISHED,
      chapterStatus: ContentStatus.PUBLISHED,
    });

    // Pagination group: 12 public stories in their own category.
    for (let index = 1; index <= 12; index += 1) {
      await createStory({
        suffix: `page-${String(index).padStart(2, "0")}`,
        title: `Seagull Log ${String(index).padStart(2, "0")}`,
        author: "Gull Watcher",
        shortDescription: "Pagination fixture.",
        categoryId: pageCat,
        tagIds: [],
        views: 12 - index,
        publishedAt: new Date(Date.UTC(2026, 6, index)),
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

  it("matches title, author, description, tag and category fields", async () => {
    const byTag = await queryStorySearch({
      ...base,
      q: "Lighthouse",
      category: `${PREFIX}-cat`,
    });
    expect(slugs(byTag.stories)).toEqual([
      `${PREFIX}-a`,
      `${PREFIX}-b`,
      `${PREFIX}-c`,
      `${PREFIX}-e`,
      `${PREFIX}-h`,
    ]);

    const byDescription = await queryStorySearch({
      ...base,
      q: "blueprints",
      category: `${PREFIX}-cat`,
    });
    expect(slugs(byDescription.stories)).toEqual([`${PREFIX}-b`]);

    const byAuthor = await queryStorySearch({
      ...base,
      q: "Society",
      category: `${PREFIX}-cat`,
    });
    expect(slugs(byAuthor.stories)).toEqual([`${PREFIX}-c`]);

    const byTagName = await queryStorySearch({
      ...base,
      q: "Legacy",
      category: `${PREFIX}-cat`,
    });
    expect(slugs(byTagName.stories)).toEqual([`${PREFIX}-a`, `${PREFIX}-h`]);

    const byCategoryName = await queryStorySearch({ ...base, q: "Nautical" });
    expect(slugs(byCategoryName.stories)).toEqual([`${PREFIX}-g`]);
  });

  it("returns published stories and excludes drafts and archived", async () => {
    const result = await queryStorySearch({
      ...base,
      q: "Lighthouse",
      category: `${PREFIX}-cat`,
    });
    const returned = slugs(result.stories);
    expect(returned).toEqual([
      `${PREFIX}-a`,
      `${PREFIX}-b`,
      `${PREFIX}-c`,
      `${PREFIX}-e`,
      `${PREFIX}-h`,
    ]);
    expect(returned).not.toContain(`${PREFIX}-d`);
    expect(returned).not.toContain(`${PREFIX}-f`);
  });

  it("is case-insensitive", async () => {
    const result = await queryStorySearch({
      ...base,
      q: "LIGHTHOUSE",
      category: `${PREFIX}-cat`,
    });
    expect(slugs(result.stories)).toEqual([
      `${PREFIX}-a`,
      `${PREFIX}-b`,
      `${PREFIX}-c`,
      `${PREFIX}-e`,
      `${PREFIX}-h`,
    ]);
  });

  it("treats a percent sign as a literal, not a wildcard", async () => {
    const result = await queryStorySearch({
      ...base,
      q: "%",
      category: `${PREFIX}-cat`,
    });
    expect(result.total).toBe(0);
  });

  it("supports a facet-only search with no term", async () => {
    const result = await queryStorySearch({
      ...base,
      category: `${PREFIX}-cat`,
    });
    expect(slugs(result.stories)).toEqual([
      `${PREFIX}-a`,
      `${PREFIX}-b`,
      `${PREFIX}-c`,
      `${PREFIX}-e`,
      `${PREFIX}-h`,
    ]);
  });

  it("combines a term with tags using AND semantics", async () => {
    const single = await queryStorySearch({
      ...base,
      q: "Lighthouse",
      category: `${PREFIX}-cat`,
      tags: [`${PREFIX}-lighthouse`],
    });
    expect(slugs(single.stories)).toEqual([
      `${PREFIX}-a`,
      `${PREFIX}-h`,
    ]);

    const both = await queryStorySearch({
      ...base,
      q: "Lighthouse",
      category: `${PREFIX}-cat`,
      tags: [`${PREFIX}-lighthouse`, `${PREFIX}-beacon`],
    });
    expect(both.total).toBe(0);
  });

  it("orders by title when asked", async () => {
    const result = await queryStorySearch({
      ...base,
      q: "Lighthouse",
      category: `${PREFIX}-cat`,
      sort: "title",
    });
    expect(result.stories.map((story) => story.slug)).toEqual([
      `${PREFIX}-h`,
      `${PREFIX}-c`,
      `${PREFIX}-e`,
      `${PREFIX}-b`,
      `${PREFIX}-a`,
    ]);
  });

  it("paginates results and clamps a page beyond the last", async () => {
    const first = await queryStorySearch({
      ...base,
      q: "Seagull",
      category: `${PREFIX}-page`,
    });
    expect(first.total).toBe(12);
    expect(first.pageCount).toBe(2);
    expect(first.page).toBe(1);
    expect(first.stories).toHaveLength(10);

    const second = await queryStorySearch({
      ...base,
      q: "Seagull",
      category: `${PREFIX}-page`,
      page: 2,
    });
    expect(second.page).toBe(2);
    expect(second.stories).toHaveLength(2);

    const beyond = await queryStorySearch({
      ...base,
      q: "Seagull",
      category: `${PREFIX}-page`,
      page: 999999,
    });
    expect(beyond.page).toBe(2);
    expect(beyond.stories).toHaveLength(2);
  });

  it("returns an empty, well-formed result for an unmatched term", async () => {
    const result = await queryStorySearch({ ...base, q: "zzzznomatch" });
    expect(result.total).toBe(0);
    expect(result.stories).toHaveLength(0);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
  });
});
