import { describe, expect, it } from "vitest";
import {
  coordinateAggregationRun,
  generateDraftSlug,
  normalizeFeedItem,
  type FeedSourceBatch,
} from "@/lib/news/aggregator";
import type { GeminiSummarizeInput, GeminiSummarizeResult, RawFeedItem } from "@/lib/news/types";

describe("News Aggregator - Normalization & Slugs", () => {
  it("normalizes raw feed items into valid candidates", () => {
    const raw: RawFeedItem = {
      title: "  Ministry of Finance Approves <b>Infrastructure</b> Budget  ",
      link: "https://finance.example/budget-2026?utm_source=rss",
      guid: "fin-2026-01",
      publishedAt: new Date("2026-10-12T08:00:00Z"),
      summary: "A comprehensive fiscal breakdown of transport expenditures.",
      author: "Office of the Minister",
    };

    const normalized = normalizeFeedItem(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.title).toBe("Ministry of Finance Approves Infrastructure Budget");
    expect(normalized?.canonicalUrl).toBe("https://finance.example/budget-2026");
    expect(normalized?.externalId).toBe("fin-2026-01");
    expect(normalized?.contentHash).toBeTruthy();
  });

  it("safely returns null for items with missing title or invalid URL", () => {
    expect(
      normalizeFeedItem({
        title: "",
        link: "https://news.example/test",
        guid: null,
        publishedAt: null,
        summary: null,
        author: null,
      }),
    ).toBeNull();

    expect(
      normalizeFeedItem({
        title: "Valid Title",
        link: "invalid-protocol://news.example",
        guid: null,
        publishedAt: null,
        summary: null,
        author: null,
      }),
    ).toBeNull();
  });

  it("generates clean URL slugs deterministically", () => {
    expect(generateDraftSlug("Global Tech Summit: Future of Quantum Computing & AI in 2026")).toBe(
      "global-tech-summit-future-of-quantum-computing-ai-in-2026",
    );
    expect(generateDraftSlug("")).toBe("news-story-draft");
  });
});

describe("News Aggregator - Orchestration Layer", () => {
  const sampleBatches: FeedSourceBatch[] = [
    {
      sourceId: "src-business",
      sourceName: "Business Daily Wire",
      items: [
        {
          title: "Apex Bank Maintains Benchmark Monetary Rate Amid Moderate Price Pressures",
          link: "https://businessdaily.example/rates-hold-2026",
          guid: "bd-001",
          publishedAt: new Date("2026-10-12T10:00:00Z"),
          summary:
            "Monetary authorities voted unanimously to keep the key lending rate unchanged at twelve percent, noting ongoing disinflationary trends across wholesale energy markets.",
          author: "Economic Desk",
        },
        {
          title: "Apex Bank Maintains Benchmark Monetary Rate Amid Moderate Price Pressures", // Duplicate URL
          link: "https://businessdaily.example/rates-hold-2026?utm_source=newsletter",
          guid: "bd-002",
          publishedAt: new Date("2026-10-12T10:05:00Z"),
          summary: "Monetary authorities voted unanimously to keep the key lending rate unchanged.",
          author: "Economic Desk",
        },
        {
          title: "Telecom Consortium Finalizes Cross-Border Fiber Optical Network",
          link: "https://businessdaily.example/telecom-fiber-expansion",
          guid: "bd-003",
          publishedAt: new Date("2026-10-12T09:30:00Z"),
          summary:
            "A group of regional network operators completed a thousand-kilometer optical backhaul route connecting coastal landing stations to inland data centers.",
          author: "Tech Correspondent",
        },
      ],
    },
    {
      sourceId: "src-politics",
      sourceName: "National Herald Tribune",
      items: [
        {
          title: "Port Authority Commissions Advanced Automated Cargo Scanning Facilities",
          link: "https://herald.example/port-cargo-automation",
          guid: "herald-101",
          publishedAt: new Date("2026-10-12T08:00:00Z"),
          summary:
            "Customs and port management inaugurated automated inspection gantries capable of processing six hundred containers hourly without manual staging delays.",
          author: "Maritime Bureau",
        },
      ],
    },
  ];

  const mockSummarizer = async (input: GeminiSummarizeInput): Promise<GeminiSummarizeResult> => {
    return {
      success: true,
      shortDescription:
        "Monetary policymakers maintained benchmark lending rates at twelve percent, citing positive inflationary moderation across major domestic trade sectors.",
      summary:
        "The central banking committee voted unanimously to hold its key policy rate steady during its final quarterly session. Authorities cited encouraging moderations in headline goods inflation while signaling a readiness to maintain current borrowing costs until foreign exchange markets demonstrate sustained equilibrium.",
      wordCount: {
        shortDescription: 20,
        summary: 50,
      },
      model: "gemini-2.5-flash",
      sourceName: input.sourceName,
      canonicalUrl: input.canonicalUrl,
    };
  };

  it("coordinates discovery, deduplication, scoring, and summarization in-memory", async () => {
    const result = await coordinateAggregationRun(sampleBatches, {
      now: new Date("2026-10-12T12:00:00Z"),
      maxArticlesPerRun: 10,
      maxAiSummariesPerRun: 5,
      summarizeFn: mockSummarizer,
    });

    expect(result.totalDiscovered).toBe(4);
    expect(result.totalValid).toBe(4);
    expect(result.totalUnique).toBe(3); // 1 duplicate skipped
    expect(result.totalDuplicates).toBe(1);
    expect(result.totalSummarized).toBe(3);
    expect(result.totalAiCalls).toBe(3);

    // Verify duplicate was identified and not sent to AI
    const duplicateResult = result.results.find((r) => r.status === "DUPLICATE_SKIPPED");
    expect(duplicateResult).toBeDefined();
    expect(duplicateResult?.duplicateInfo?.primaryUrl).toBe("https://businessdaily.example/rates-hold-2026");

    // CRITICAL EDITORIAL & SAFETY INVARIANT CHECK:
    // Every generated draft MUST have status === "DRAFT" and publishedAt === null!
    const summarizedResults = result.results.filter((r) => r.status === "SUMMARIZED");
    expect(summarizedResults.length).toBe(3);

    for (const item of summarizedResults) {
      expect(item.storyDraft).toBeDefined();
      expect(item.storyDraft?.status).toBe("DRAFT");
      expect(item.storyDraft?.publishedAt).toBeNull();
      expect(item.storyDraft?.sourceName).toBeTruthy();
      expect(item.storyDraft?.canonicalUrl).toBeTruthy();
      expect(item.storyDraft?.description).toContain("<p>");
    }
  });

  it("enforces maxAiSummariesPerRun budget ceiling strictly", async () => {
    let aiCallsCount = 0;
    const countingSummarizer = async (input: GeminiSummarizeInput): Promise<GeminiSummarizeResult> => {
      aiCallsCount += 1;
      return mockSummarizer(input);
    };

    const result = await coordinateAggregationRun(sampleBatches, {
      now: new Date("2026-10-12T12:00:00Z"),
      maxArticlesPerRun: 10,
      maxAiSummariesPerRun: 1, // Only allow 1 AI summary
      summarizeFn: countingSummarizer,
    });

    expect(aiCallsCount).toBe(1);
    expect(result.totalSummarized).toBe(1);

    // Remaining unique articles should be marked AI_BUDGET_EXCEEDED
    const budgetExceeded = result.results.filter((r) => r.status === "AI_BUDGET_EXCEEDED");
    expect(budgetExceeded.length).toBe(2);
  });

  it("handles AI failure for one article without losing or aborting remaining candidates", async () => {
    let callIndex = 0;
    const failingSummarizer = async (input: GeminiSummarizeInput): Promise<GeminiSummarizeResult> => {
      callIndex += 1;
      if (callIndex === 1) {
        throw new Error("Temporary provider rate limit (HTTP 429)");
      }
      return mockSummarizer(input);
    };

    const result = await coordinateAggregationRun(sampleBatches, {
      now: new Date("2026-10-12T12:00:00Z"),
      maxArticlesPerRun: 10,
      maxAiSummariesPerRun: 5,
      summarizeFn: failingSummarizer,
    });

    // 1 AI failed, 2 succeeded
    const failedItem = result.results.find((r) => r.status === "AI_FAILED");
    expect(failedItem).toBeDefined();
    expect(failedItem?.rejectionOrErrorReason).toContain("HTTP 429");

    expect(result.totalSummarized).toBe(2);
    expect(result.totalAiCalls).toBe(3);
  });

  it("handles AI returning INSUFFICIENT_CONTENT safely", async () => {
    const insufficientSummarizer = async (input: GeminiSummarizeInput): Promise<GeminiSummarizeResult> => {
      return {
        success: false,
        rejectionReason: "Article snippet lacked verifiable journalistic details.",
        model: "gemini-2.5-flash",
        sourceName: input.sourceName,
        canonicalUrl: input.canonicalUrl,
      };
    };

    const result = await coordinateAggregationRun(sampleBatches, {
      now: new Date("2026-10-12T12:00:00Z"),
      maxArticlesPerRun: 10,
      maxAiSummariesPerRun: 1,
      summarizeFn: insufficientSummarizer,
    });

    const insufficientItem = result.results.find((r) => r.status === "AI_INSUFFICIENT_CONTENT");
    expect(insufficientItem).toBeDefined();
    expect(insufficientItem?.rejectionOrErrorReason).toContain("lacked verifiable journalistic details");
    expect(result.totalSummarized).toBe(0);
  });

  it("filters candidates below minimum score threshold before calling AI", async () => {
    let aiCallsCount = 0;
    const countingSummarizer = async (input: GeminiSummarizeInput): Promise<GeminiSummarizeResult> => {
      aiCallsCount += 1;
      return mockSummarizer(input);
    };

    // Set an ultra-high score threshold of 99 that normal items won't meet
    const result = await coordinateAggregationRun(sampleBatches, {
      now: new Date("2026-10-12T12:00:00Z"),
      minScoreThreshold: 99,
      summarizeFn: countingSummarizer,
    });

    expect(aiCallsCount).toBe(0);
    expect(result.totalSummarized).toBe(0);

    const lowScoreItems = result.results.filter((r) => r.status === "LOW_SCORE_FILTERED");
    expect(lowScoreItems.length).toBe(3); // All 3 unique candidates filtered out
  });
});
