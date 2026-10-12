import { describe, expect, it } from "vitest";
import {
  createNewsDatabaseSyncAdapter,
  findArticleByCanonicalUrl,
  findArticleByExternalId,
  isUniqueConstraintViolation,
  persistImportedArticleRecord,
  recordSyncLogEntry,
  resolveUniqueStorySlug,
  type PersistenceClient,
  type PersistArticleInput,
} from "@/lib/news/persistence";

type MockRecord = Record<string, unknown>;

interface MockDbState {
  stories: Map<string, MockRecord>;
  importedArticles: Map<string, MockRecord>;
  syncLogs: Map<string, MockRecord>;
}

function createMockPrismaClient(): { client: PersistenceClient; state: MockDbState } {
  const state: MockDbState = {
    stories: new Map(),
    importedArticles: new Map(),
    syncLogs: new Map(),
  };

  const client: PersistenceClient = {
    story: {
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.id) {
          const found = state.stories.get(where.id);
          return found ? ({ id: String(found.id) }) : null;
        }
        if (where.slug) {
          for (const s of state.stories.values()) {
            if (s.slug === where.slug) return { id: String(s.id) };
          }
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `story-${Math.random().toString(36).slice(2, 9)}`;
        const record = { id, ...data };
        state.stories.set(id, record);
        return { id };
      },
    },
    importedArticle: {
      findUnique: async ({
        where,
      }: {
        where: {
          canonicalUrl?: string;
          sourceId_externalId?: { sourceId: string; externalId: string };
        };
      }) => {
        if (where.canonicalUrl) {
          for (const a of state.importedArticles.values()) {
            if (a.canonicalUrl === where.canonicalUrl) {
              return {
                id: String(a.id),
                storyId: a.storyId ? String(a.storyId) : null,
                contentHash: String(a.contentHash),
                syncStatus: a.syncStatus ? String(a.syncStatus) : "DISCOVERED",
              };
            }
          }
        }
        if (where.sourceId_externalId) {
          const { sourceId, externalId } = where.sourceId_externalId;
          for (const a of state.importedArticles.values()) {
            if (a.sourceId === sourceId && a.externalId === externalId) {
              return {
                id: String(a.id),
                storyId: a.storyId ? String(a.storyId) : null,
                contentHash: String(a.contentHash),
                syncStatus: a.syncStatus ? String(a.syncStatus) : "DISCOVERED",
              };
            }
          }
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // Enforce canonicalUrl unique constraint
        for (const a of state.importedArticles.values()) {
          if (a.canonicalUrl === data.canonicalUrl) {
            const err = new Error("Unique constraint failed on canonicalUrl") as Error & { code?: string };
            err.code = "P2002";
            throw err;
          }
        }
        // Enforce sourceId_externalId unique constraint when externalId is non-null
        if (data.externalId) {
          for (const a of state.importedArticles.values()) {
            if (a.sourceId === data.sourceId && a.externalId === data.externalId) {
              const err = new Error("Unique constraint failed on sourceId_externalId") as Error & { code?: string };
              err.code = "P2002";
              throw err;
            }
          }
        }
        const id = `art-${Math.random().toString(36).slice(2, 9)}`;
        const record = { id, ...data };
        state.importedArticles.set(id, record);
        return { id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = state.importedArticles.get(where.id);
        if (existing) {
          Object.assign(existing, data);
        }
        return existing;
      },
    },
    newsSyncLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `log-${Math.random().toString(36).slice(2, 9)}`;
        const record = { id, ...data };
        state.syncLogs.set(id, record);
        return { id };
      },
    },
    $transaction: async <T>(fn: (tx: import("@/lib/news/persistence").DatabaseTransactionClient) => Promise<T>): Promise<T> => {
      // In-memory transaction proxy
      return fn(client);
    },
  };

  return { client, state };
}

describe("News Persistence - Invariant & Draft Verification", () => {
  it("persists imported article with story draft in strictly DRAFT status", async () => {
    const { client, state } = createMockPrismaClient();

    const input: PersistArticleInput = {
      sourceId: "src-tech-wire",
      externalId: "guid-001",
      canonicalUrl: "https://techwire.example/quantum-breakthrough",
      title: "Researchers Achieve Quantum Supremacy in Optimization",
      author: "Dr. Kelvin Cole",
      rawPublishedAt: new Date("2026-10-12T10:00:00Z"),
      summary: "A thorough report on quantum annealing chips.",
      contentHash: "hash-001",
      storyDraft: {
        title: "Researchers Achieve Quantum Supremacy in Optimization",
        slug: "researchers-achieve-quantum-supremacy-in-optimization",
        shortDescription: "A landmark quantum processor solved optimization challenges.",
        description: "<p>Engineers demonstrated significant processing speedups.</p>",
        author: "Dr. Kelvin Cole",
        status: "DRAFT",
        publishedAt: null,
        sourceName: "Tech Wire",
        canonicalUrl: "https://techwire.example/quantum-breakthrough",
      },
    };

    const result = await persistImportedArticleRecord(input, client);

    expect(result.importedArticleId).toBeTruthy();
    expect(result.storyId).toBeTruthy();
    expect(result.isDuplicate).toBe(false);

    // Verify Story record in DB: Strict DRAFT invariant
    const persistedStory = state.stories.get(result.storyId!);
    expect(persistedStory).toBeDefined();
    expect(persistedStory?.status).toBe("DRAFT");
    expect(persistedStory?.publishedAt).toBeNull();
    expect(persistedStory?.title).toBe(input.title);

    // Verify ImportedArticle record in DB
    const persistedArticle = state.importedArticles.get(result.importedArticleId);
    expect(persistedArticle).toBeDefined();
    expect(persistedArticle?.storyId).toBe(result.storyId);
    expect(persistedArticle?.canonicalUrl).toBe(input.canonicalUrl);
    expect(persistedArticle?.syncStatus).toBe("IMPORTED");
  });

  it("throws error if editorial invariant is violated (storyDraft marked PUBLISHED)", async () => {
    const { client } = createMockPrismaClient();

    const invalidInput: PersistArticleInput = {
      sourceId: "src-1",
      externalId: null,
      canonicalUrl: "https://news.example/test",
      title: "Test News",
      author: null,
      rawPublishedAt: null,
      summary: null,
      contentHash: "hash",
      storyDraft: {
        title: "Test News",
        slug: "test-news",
        shortDescription: "desc",
        description: "<p>text</p>",
        author: null,
        status: "PUBLISHED" as unknown as "DRAFT", // ILLEGAL ATTEMPT!
        publishedAt: new Date() as unknown as null, // ILLEGAL ATTEMPT!
        sourceName: "Source",
        canonicalUrl: "https://news.example/test",
      },
    };

    await expect(persistImportedArticleRecord(invalidInput, client)).rejects.toThrow(
      "Editorial invariant violated: Imported stories MUST be DRAFT with publishedAt = null.",
    );
  });

  it("throws error if required fields are missing", async () => {
    const { client } = createMockPrismaClient();

    await expect(
      persistImportedArticleRecord(
        {
          sourceId: "",
          externalId: null,
          canonicalUrl: "",
          title: "",
          author: null,
          rawPublishedAt: null,
          summary: null,
          contentHash: "",
        },
        client,
      ),
    ).rejects.toThrow("Missing required article persistence fields");
  });
});

describe("News Persistence - Uniqueness & Slug Collisions", () => {
  it("resolves slug collisions by appending random entropy", async () => {
    const { client } = createMockPrismaClient();

    // Insert an existing story with the base slug
    await client.story.create({
      data: {
        title: "Existing Story",
        slug: "electric-vehicles-boom",
        status: "DRAFT",
        publishedAt: null,
      },
    });

    const uniqueSlug = await resolveUniqueStorySlug("electric-vehicles-boom", client);
    expect(uniqueSlug).not.toBe("electric-vehicles-boom");
    expect(uniqueSlug).toMatch(/^electric-vehicles-boom-[0-9a-f]{6}$/);
  });

  it("handles duplicate canonical URL gracefully without throwing error", async () => {
    const { client } = createMockPrismaClient();

    const input: PersistArticleInput = {
      sourceId: "src-1",
      externalId: "ext-1",
      canonicalUrl: "https://news.example/rates-hold",
      title: "Central Bank Decision",
      author: null,
      rawPublishedAt: null,
      summary: "First summary",
      contentHash: "hash-1",
    };

    // First insertion succeeds
    const firstResult = await persistImportedArticleRecord(input, client);
    expect(firstResult.isDuplicate).toBe(false);

    // Second insertion with identical canonical URL is caught as a duplicate
    const secondResult = await persistImportedArticleRecord(
      {
        ...input,
        title: "Updated Title for Same Article",
      },
      client,
    );

    expect(secondResult.isDuplicate).toBe(true);
    expect(secondResult.importedArticleId).toBe(firstResult.importedArticleId);
  });

  it("handles duplicate source-scoped external ID gracefully without throwing error", async () => {
    const { client } = createMockPrismaClient();

    const input1: PersistArticleInput = {
      sourceId: "src-aviation",
      externalId: "guid-runway-99",
      canonicalUrl: "https://aviation.example/runway-inspection",
      title: "Airport Runway Inspection Concludes",
      author: null,
      rawPublishedAt: null,
      summary: "Summary text",
      contentHash: "hash-runway-1",
    };

    // Different canonical URL, but SAME sourceId and externalId
    const input2: PersistArticleInput = {
      sourceId: "src-aviation",
      externalId: "guid-runway-99",
      canonicalUrl: "https://aviation.example/runway-inspection-republished",
      title: "Airport Runway Inspection Concludes (Copy)",
      author: null,
      rawPublishedAt: null,
      summary: "Summary text",
      contentHash: "hash-runway-2",
    };

    const res1 = await persistImportedArticleRecord(input1, client);
    expect(res1.isDuplicate).toBe(false);

    const res2 = await persistImportedArticleRecord(input2, client);
    expect(res2.isDuplicate).toBe(true);
    expect(res2.importedArticleId).toBe(res1.importedArticleId);
  });
});

describe("News Persistence - Lookups & Sync Logs", () => {
  it("finds existing articles by canonical URL and external ID", async () => {
    const { client } = createMockPrismaClient();

    await persistImportedArticleRecord(
      {
        sourceId: "src-lookup",
        externalId: "ext-lookup-88",
        canonicalUrl: "https://lookup.example/article-88",
        title: "Lookup Test Title",
        author: null,
        rawPublishedAt: null,
        summary: null,
        contentHash: "hash-88",
      },
      client,
    );

    const byUrl = await findArticleByCanonicalUrl("https://lookup.example/article-88", client);
    expect(byUrl).not.toBeNull();
    expect(byUrl?.contentHash).toBe("hash-88");

    const byExternalId = await findArticleByExternalId("src-lookup", "ext-lookup-88", client);
    expect(byExternalId).not.toBeNull();
    expect(byExternalId?.contentHash).toBe("hash-88");

    const missing = await findArticleByCanonicalUrl("https://lookup.example/nonexistent", client);
    expect(missing).toBeNull();
  });

  it("records structured sync logs", async () => {
    const { client, state } = createMockPrismaClient();

    const log = await recordSyncLogEntry(
      {
        sourceId: "src-1",
        jobId: "sync-job-999",
        status: "SUCCESS",
        discoveredCount: 15,
        importedCount: 5,
        skippedCount: 10,
        failedCount: 0,
        durationMs: 3450,
      },
      client,
    );

    expect(log.id).toBeTruthy();
    const stored = state.syncLogs.get(log.id);
    expect(stored).toBeDefined();
    expect(stored?.jobId).toBe("sync-job-999");
    expect(stored?.status).toBe("SUCCESS");
    expect(stored?.articlesImported).toBe(5);
  });

  it("creates sync adapter satisfying NewsDatabaseSyncPort contract", async () => {
    const { client } = createMockPrismaClient();
    const adapter = createNewsDatabaseSyncAdapter(client);

    expect(typeof adapter.acquireSyncLock).toBe("function");
    expect(typeof adapter.releaseSyncLock).toBe("function");
    expect(typeof adapter.findExistingArticleByCanonicalUrl).toBe("function");
    expect(typeof adapter.persistImportedArticle).toBe("function");
    expect(typeof adapter.recordSyncLog).toBe("function");
  });

  it("correctly identifies Prisma P2002 unique constraint violations", () => {
    expect(isUniqueConstraintViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueConstraintViolation({ code: "P2003" })).toBe(false);
    expect(isUniqueConstraintViolation(new Error("generic error"))).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
  });
});
