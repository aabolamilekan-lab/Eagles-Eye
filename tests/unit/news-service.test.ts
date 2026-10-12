import { describe, expect, it } from "vitest";
import {
  executeNewsAggregationJob,
  runNewsAggregationWithLock,
  verifyCronAuthorization,
} from "@/lib/news/service";

describe("News Cron Authorization - verifyCronAuthorization", () => {
  const secret = "valid-test-secret-with-sufficient-length-32";

  it("authorizes valid Bearer token", () => {
    expect(verifyCronAuthorization(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects missing or empty authorization header", () => {
    expect(verifyCronAuthorization(null, secret)).toBe(false);
    expect(verifyCronAuthorization("", secret)).toBe(false);
  });

  it("rejects non-Bearer scheme", () => {
    expect(verifyCronAuthorization(`Basic ${secret}`, secret)).toBe(false);
    expect(verifyCronAuthorization(`Token ${secret}`, secret)).toBe(false);
  });

  it("rejects token with mismatched value", () => {
    expect(verifyCronAuthorization("Bearer wrong-token-value-with-same-len", secret)).toBe(false);
  });

  it("rejects token with mismatched length", () => {
    expect(verifyCronAuthorization("Bearer short", secret)).toBe(false);
  });

  it("fails closed when expectedSecret is empty or undefined", () => {
    expect(verifyCronAuthorization(`Bearer ${secret}`, undefined)).toBe(false);
    expect(verifyCronAuthorization(`Bearer ${secret}`, "")).toBe(false);
  });
});

describe("News Ingestion Pipeline Service - executeNewsAggregationJob", () => {
  function createMockPipelineClient(sources: Array<{
    id: string;
    name: string;
    feedUrl: string;
    etag?: string | null;
    lastModified?: string | null;
    consecutiveFailures?: number;
  }> = []) {
    const persistedStories: Array<Record<string, unknown>> = [];
    const persistedArticles: Array<Record<string, unknown>> = [];
    const syncLogs: Array<Record<string, unknown>> = [];
    const sourceUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];

    const client = {
      newsSource: {
        findMany: async () => sources.map(s => ({
          ...s,
          etag: s.etag ?? null,
          lastModified: s.lastModified ?? null,
          consecutiveFailures: s.consecutiveFailures ?? 0,
        })),
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          sourceUpdates.push({ id: args.where.id, data: args.data });
          return { id: args.where.id, ...args.data };
        },
      },
      story: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          const id = `story-${Math.random().toString(36).slice(2, 9)}`;
          const record = { id, ...args.data };
          persistedStories.push(record);
          return { id };
        },
      },
      importedArticle: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          const id = `art-${Math.random().toString(36).slice(2, 9)}`;
          const record = { id, ...args.data };
          persistedArticles.push(record);
          return { id };
        },
        update: async () => ({}),
      },
      newsSyncLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          const id = `log-${Math.random().toString(36).slice(2, 9)}`;
          syncLogs.push({ id, ...args.data });
          return { id };
        },
      },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
        return fn({
          story: client.story,
          importedArticle: client.importedArticle,
        });
      },
    };

    return { client, persistedStories, persistedArticles, syncLogs, sourceUpdates };
  }

  it("handles case where no active sources exist", async () => {
    const { client } = createMockPipelineClient([]);
    const summary = await executeNewsAggregationJob({
      client: client as unknown as import("@/lib/news/service").NewsAggregationJobOptions["client"],
    });

    expect(summary.status).toBe("NO_SOURCES");
    expect(summary.sourcesProcessed).toBe(0);
    expect(summary.articlesImported).toBe(0);
  });

  it("executes full pipeline with mock feed and Gemini summary, enforcing strict DRAFT invariant", async () => {
    const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tech Dispatch</title>
    <link>https://techdispatch.example</link>
    <item>
      <title>Breakthrough in Solid State Quantum Computing</title>
      <link>https://techdispatch.example/quantum-2026</link>
      <guid>quantum-guid-2026</guid>
      <pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate>
      <description>Scientists achieve continuous coherent qubit operations at scale.</description>
    </item>
  </channel>
</rss>`;

    const { client, persistedStories, persistedArticles, syncLogs } = createMockPipelineClient([
      {
        id: "source-tech",
        name: "Tech Dispatch",
        feedUrl: "https://techdispatch.example/rss.xml",
      },
    ]);

    const summary = await executeNewsAggregationJob({
      client: client as unknown as import("@/lib/news/service").NewsAggregationJobOptions["client"],
      fetchFeedFn: async () => ({ status: 200, body: mockRssXml }),
      summarizeFn: async () => ({
        success: true,
        summary: "Researchers demonstrated stable coherent quantum circuits at scale.",
        shortDescription: "Major breakthrough in solid-state quantum computing architecture.",
        wordCount: {
          shortDescription: 8,
          summary: 8,
        },
        model: "gemini-2.5-flash",
        sourceName: "Tech Dispatch",
        canonicalUrl: "https://techdispatch.example/quantum-2026",
      }),
    });

    expect(summary.status).toBe("SUCCESS");
    expect(summary.sourcesProcessed).toBe(1);
    expect(summary.articlesDiscovered).toBe(1);
    expect(summary.articlesImported).toBe(1);

    // Verify STRICT DRAFT INVARIANTS on persisted story
    expect(persistedStories).toHaveLength(1);
    expect(persistedStories[0]!.status).toBe("DRAFT");
    expect(persistedStories[0]!.publishedAt).toBeNull();
    expect(persistedStories[0]!.title).toBe("Breakthrough in Solid State Quantum Computing");

    // Verify imported article row
    expect(persistedArticles).toHaveLength(1);
    expect(persistedArticles[0]!.canonicalUrl).toBe("https://techdispatch.example/quantum-2026");
    expect(persistedArticles[0]!.storyId).toBe(persistedStories[0]!.id);

    // Verify sync log entry
    expect(syncLogs).toHaveLength(1);
    expect(syncLogs[0]!.status).toBe("SUCCESS");
    expect(syncLogs[0]!.articlesImported).toBe(1);
  });

  it("handles 304 Not Modified without reprocessing articles", async () => {
    const { client, persistedArticles, sourceUpdates } = createMockPipelineClient([
      {
        id: "source-304",
        name: "Unchanged Feed",
        feedUrl: "https://unchanged.example/rss.xml",
        etag: '"tag-123"',
      },
    ]);

    const summary = await executeNewsAggregationJob({
      client: client as unknown as import("@/lib/news/service").NewsAggregationJobOptions["client"],
      fetchFeedFn: async () => ({ status: 304, body: "" }),
    });

    expect(summary.status).toBe("SUCCESS");
    expect(summary.sourcesProcessed).toBe(1);
    expect(summary.articlesImported).toBe(0);
    expect(persistedArticles).toHaveLength(0);
    expect(sourceUpdates).toHaveLength(1);
    expect(sourceUpdates[0]!.data.consecutiveFailures).toBe(0);
  });

  it("handles source failure gracefully and records error telemetry", async () => {
    const { client, syncLogs, sourceUpdates } = createMockPipelineClient([
      {
        id: "source-fail",
        name: "Broken Feed",
        feedUrl: "https://broken.example/rss.xml",
      },
    ]);

    const summary = await executeNewsAggregationJob({
      client: client as unknown as import("@/lib/news/service").NewsAggregationJobOptions["client"],
      fetchFeedFn: async () => {
        throw new Error("Connection timed out (ETIMEDOUT)");
      },
    });

    expect(summary.status).toBe("FAILED");
    expect(summary.articlesFailed).toBe(1);
    expect(syncLogs).toHaveLength(1);
    expect(syncLogs[0]!.status).toBe("FAILED");
    expect(syncLogs[0]!.errorMessage).toContain("Connection timed out");
    expect(sourceUpdates[0]!.data.lastErrorMessage).toContain("Connection timed out");
  });

  it("returns SKIPPED_LOCKED when synchronization lock is already active", async () => {
    const { client } = createMockPipelineClient([]);
    const mockContendedLockClient = {
      newsSyncLock: {
        upsert: async () => ({}),
        updateMany: async () => ({ count: 0 }), // 0 updated = lock held by another
      },
    };

    const summary = await runNewsAggregationWithLock({
      client: client as unknown as import("@/lib/news/service").NewsAggregationJobOptions["client"],
      lockClient: mockContendedLockClient as unknown as import("@/lib/news/lock").LockClient,
    });

    expect(summary.status).toBe("SKIPPED_LOCKED");
    expect(summary.sourcesProcessed).toBe(0);
    expect(summary.errorMessage).toContain("held by another concurrent worker");
  });
});
