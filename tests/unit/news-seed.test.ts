import { describe, expect, it } from "vitest";
import { NewsFeedType } from "@prisma/client";
import {
  seedNewsCategoriesAndSources,
  initialNewsCategories,
  initialApprovedNewsSources,
  type NewsSeedDbClient,
  type NewsSourceSeedDefinition,
} from "@/lib/news/seed";

function createMockSeedDb() {
  const categories: Array<{ id: string; name: string; slug: string; description: string }> = [];
  const sources: Array<{
    id: string;
    name: string;
    slug: string;
    feedUrl: string;
    feedType: NewsFeedType;
    defaultCategoryId: string;
    pollIntervalMinutes: number;
    attributionPolicy: string;
    isActive: boolean;
    consecutiveFailures: number;
    lastFetchedAt?: Date | null;
    lastSuccessAt?: Date | null;
    lastErrorAt?: Date | null;
    lastErrorMessage?: string | null;
    etag?: string | null;
    lastModified?: string | null;
  }> = [];

  const client: NewsSeedDbClient = {
    category: {
      upsert: async ({ where, update, create }) => {
        const existing = categories.find((c) => c.slug === where.slug);
        if (existing) {
          existing.name = update.name;
          existing.description = update.description;
          return { id: existing.id, slug: existing.slug };
        }
        const created = {
          id: `cat-${Math.random().toString(36).slice(2, 9)}`,
          name: create.name,
          slug: create.slug,
          description: create.description,
        };
        categories.push(created);
        return { id: created.id, slug: created.slug };
      },
    },
    newsSource: {
      findUnique: async ({ where }) => {
        if (where.slug) {
          return sources.find((s) => s.slug === where.slug) ?? null;
        }
        if (where.feedUrl) {
          return sources.find((s) => s.feedUrl === where.feedUrl) ?? null;
        }
        return null;
      },
      create: async ({ data }) => {
        const id = `src-${Math.random().toString(36).slice(2, 9)}`;
        const record = { id, ...data };
        sources.push(record);
        return { id };
      },
      update: async ({ where, data }) => {
        const target = sources.find((s) => s.id === where.id);
        if (!target) {
          throw new Error(`NewsSource with id ${where.id} not found`);
        }
        Object.assign(target, data);
        return { id: target.id };
      },
    },
  };

  return { client, categories, sources };
}

describe("News Seeding Pipeline (seedNewsCategoriesAndSources)", () => {
  it("defines exactly three verified categories and five approved sources", () => {
    expect(initialNewsCategories).toHaveLength(3);
    expect(initialApprovedNewsSources).toHaveLength(5);
    for (const source of initialApprovedNewsSources) {
      expect(source.pollIntervalMinutes).toBe(1440);
      expect(source.attributionPolicy.length).toBeGreaterThan(10);
    }
  });

  it("creates categories and sources cleanly on initial run", async () => {
    const { client, categories, sources } = createMockSeedDb();

    const result = await seedNewsCategoriesAndSources(client);

    expect(result.categoriesUpserted).toBe(3);
    expect(result.sourcesCreated).toBe(5);
    expect(result.sourcesUpdated).toBe(0);

    expect(categories).toHaveLength(3);
    expect(sources).toHaveLength(5);

    // Verify all 5 sources map to valid categories and default pollIntervalMinutes = 1440
    for (const source of sources) {
      expect(source.pollIntervalMinutes).toBe(1440);
      expect(source.isActive).toBe(true);
      expect(source.consecutiveFailures).toBe(0);
      const cat = categories.find((c) => c.id === source.defaultCategoryId);
      expect(cat).toBeDefined();
    }
  });

  it("is idempotent: updates existing records on re-run without creating duplicates", async () => {
    const { client, categories, sources } = createMockSeedDb();

    // First run
    await seedNewsCategoriesAndSources(client);
    expect(categories).toHaveLength(3);
    expect(sources).toHaveLength(5);

    // Second run
    const secondResult = await seedNewsCategoriesAndSources(client);
    expect(secondResult.categoriesUpserted).toBe(3);
    expect(secondResult.sourcesCreated).toBe(0);
    expect(secondResult.sourcesUpdated).toBe(5);

    expect(categories).toHaveLength(3);
    expect(sources).toHaveLength(5);
  });

  it("preserves operational telemetry on existing sources during idempotent updates", async () => {
    const { client, sources } = createMockSeedDb();

    // Initial seed
    await seedNewsCategoriesAndSources(client);

    // Simulate operational telemetry accumulated during news syncing
    const target = sources.find((s) => s.slug === "global-voices-nigeria")!;
    const simulatedLastFetched = new Date("2026-10-12T06:00:00Z");
    const simulatedLastSuccess = new Date("2026-10-12T06:00:05Z");
    target.lastFetchedAt = simulatedLastFetched;
    target.lastSuccessAt = simulatedLastSuccess;
    target.etag = '"w/987654321"';
    target.lastModified = "Mon, 12 Oct 2026 05:45:00 GMT";
    target.consecutiveFailures = 0;

    // Re-run seed
    await seedNewsCategoriesAndSources(client);

    // Verify operational telemetry was NOT overwritten or reset
    expect(target.lastFetchedAt).toEqual(simulatedLastFetched);
    expect(target.lastSuccessAt).toEqual(simulatedLastSuccess);
    expect(target.etag).toBe('"w/987654321"');
    expect(target.lastModified).toBe("Mon, 12 Oct 2026 05:45:00 GMT");
  });

  it("aborts when a source slug exists with a different feedUrl", async () => {
    const { client, sources } = createMockSeedDb();

    // Pre-populate with an existing source having the same slug but different URL
    sources.push({
      id: "src-custom-1",
      name: "Global Voices Nigeria",
      slug: "global-voices-nigeria",
      feedUrl: "https://custom-mirror.example/other-feed.xml", // Different feed URL
      feedType: NewsFeedType.RSS,
      defaultCategoryId: "cat-1",
      pollIntervalMinutes: 1440,
      attributionPolicy: "Old policy",
      isActive: true,
      consecutiveFailures: 0,
    });

    await expect(seedNewsCategoriesAndSources(client)).rejects.toThrow(
      /already exists with a different feedUrl/i,
    );
  });

  it("aborts when a feedUrl already exists under a different slug", async () => {
    const { client, sources } = createMockSeedDb();

    // Pre-populate with an existing source having the same feedUrl but different slug
    sources.push({
      id: "src-custom-2",
      name: "Global Voices Nigeria Duplicate",
      slug: "gv-nigeria-alternate-slug", // Different slug
      feedUrl: "https://globalvoices.org/tag/nigeria/feed/", // Matches approved source URL
      feedType: NewsFeedType.RSS,
      defaultCategoryId: "cat-1",
      pollIntervalMinutes: 1440,
      attributionPolicy: "Old policy",
      isActive: true,
      consecutiveFailures: 0,
    });

    await expect(seedNewsCategoriesAndSources(client)).rejects.toThrow(
      /already exists under a different slug/i,
    );
  });

  it("aborts when a cross-collision occurs (slug matches row A, feedUrl matches row B)", async () => {
    const { client, sources } = createMockSeedDb();

    sources.push(
      {
        id: "src-row-a",
        name: "Row A",
        slug: "global-voices-nigeria",
        feedUrl: "https://other-url.example/feed.xml",
        feedType: NewsFeedType.RSS,
        defaultCategoryId: "cat-1",
        pollIntervalMinutes: 1440,
        attributionPolicy: "Policy A",
        isActive: true,
        consecutiveFailures: 0,
      },
      {
        id: "src-row-b",
        name: "Row B",
        slug: "other-slug",
        feedUrl: "https://globalvoices.org/tag/nigeria/feed/",
        feedType: NewsFeedType.RSS,
        defaultCategoryId: "cat-1",
        pollIntervalMinutes: 1440,
        attributionPolicy: "Policy B",
        isActive: true,
        consecutiveFailures: 0,
      },
    );

    await expect(seedNewsCategoriesAndSources(client)).rejects.toThrow(
      /Seeding conflict for source/i,
    );
  });

  it("aborts when a source definition references an unknown category slug", async () => {
    const { client } = createMockSeedDb();

    const badSources: NewsSourceSeedDefinition[] = [
      {
        name: "Invalid Source",
        slug: "invalid-source",
        feedUrl: "https://invalid.example/rss",
        feedType: NewsFeedType.RSS,
        categorySlug: "non-existent-category-slug",
        pollIntervalMinutes: 1440,
        attributionPolicy: "Policy",
      },
    ];

    await expect(
      seedNewsCategoriesAndSources(client, { sources: badSources }),
    ).rejects.toThrow(/Target category slug 'non-existent-category-slug' not found/i);
  });
});
