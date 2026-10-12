import { describe, expect, it } from "vitest";
import {
  compareScoredCandidates,
  DEFAULT_SCORING_WEIGHTS,
  scoreArticleCandidate,
  scoreCompleteness,
  scoreRecency,
  scoreTitle,
  scoreUrl,
  type ScoredArticleCandidate,
} from "@/lib/news/scoring";
import type { NormalizedArticleCandidate } from "@/lib/news/types";

describe("News Scoring - Recency", () => {
  const referenceTime = new Date("2026-10-12T12:00:00Z");

  it("scores recent articles within 6 hours with maximum recency points (35)", () => {
    const publishedAt = new Date("2026-10-12T09:00:00Z"); // 3 hours ago
    const result = scoreRecency(publishedAt, referenceTime);
    expect(result.score).toBe(35);
    expect(result.reason).toContain("within 6 hours");
  });

  it("scores articles within 12 hours with 30 points", () => {
    const publishedAt = new Date("2026-10-12T02:00:00Z"); // 10 hours ago
    const result = scoreRecency(publishedAt, referenceTime);
    expect(result.score).toBe(30);
    expect(result.reason).toContain("within 12 hours");
  });

  it("scores articles within 24 hours with 25 points", () => {
    const publishedAt = new Date("2026-10-11T16:00:00Z"); // 20 hours ago
    const result = scoreRecency(publishedAt, referenceTime);
    expect(result.score).toBe(25);
    expect(result.reason).toContain("within 24 hours");
  });

  it("scores articles within 48 hours with 18 points", () => {
    const publishedAt = new Date("2026-10-10T16:00:00Z"); // 44 hours ago
    const result = scoreRecency(publishedAt, referenceTime);
    expect(result.score).toBe(18);
  });

  it("scores articles within 7 days with 5 points", () => {
    const publishedAt = new Date("2026-10-07T12:00:00Z"); // 5 days ago
    const result = scoreRecency(publishedAt, referenceTime);
    expect(result.score).toBe(5);
  });

  it("scores articles older than 7 days with 0 points", () => {
    const publishedAt = new Date("2026-10-01T12:00:00Z"); // 11 days ago
    const result = scoreRecency(publishedAt, referenceTime);
    expect(result.score).toBe(0);
  });

  it("handles missing, null, or invalid dates safely with neutral baseline (15 points)", () => {
    expect(scoreRecency(null, referenceTime).score).toBe(15);
    expect(scoreRecency(undefined, referenceTime).score).toBe(15);
    expect(scoreRecency(new Date("invalid-date-string"), referenceTime).score).toBe(15);
  });

  it("handles dates significantly in the future safely with conservative baseline (10 points)", () => {
    const futureDate = new Date("2026-10-15T12:00:00Z"); // 3 days in future
    const result = scoreRecency(futureDate, referenceTime);
    expect(result.score).toBe(10);
    expect(result.reason).toContain("in the future");
  });
});

describe("News Scoring - Completeness", () => {
  it("scores full completeness with maximum points (30)", () => {
    const longSummary = "Detailed news report. ".repeat(40); // 120 words
    const result = scoreCompleteness(longSummary, "Jane Doe", "guid-1234");
    expect(result.score).toBe(30); // 18 + 6 + 6
    expect(result.reason).toContain("Substantive summary");
    expect(result.reason).toContain("Author attributed");
    expect(result.reason).toContain("External identifier present");
  });

  it("scores moderate summary without author or external ID proportionally", () => {
    const moderateSummary = "Brief news item with sufficient context and detail. ".repeat(7); // ~50 words
    const result = scoreCompleteness(moderateSummary, null, null);
    expect(result.score).toBe(12); // 12 + 0 + 0
    expect(result.reason).toContain("Moderate summary");
    expect(result.reason).toContain("No author attribution");
  });

  it("scores sparse or missing summary with 0 summary points", () => {
    const result = scoreCompleteness("Too short", null, null);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("Sparse or missing summary");
  });
});

describe("News Scoring - Title Quality", () => {
  it("rewards ideal journalistic length and standard casing (20 points)", () => {
    const title = "Central Bank Holds Benchmark Interest Rate Steady Amid Inflation Easing";
    const result = scoreTitle(title);
    expect(result.score).toBe(20); // 12 + 8
    expect(result.reason).toContain("Ideal headline length");
    expect(result.reason).toContain("Standard headline casing");
  });

  it("penalizes ALL CAPS clickbait formatting", () => {
    const title = "SHOCKING REVELATIONS AS PRIME MINISTER RESIGNS IN MAJOR CRISIS OVERNIGHT";
    const result = scoreTitle(title);
    expect(result.score).toBe(12); // 12 length, 0 casing
    expect(result.reason).toContain("Penalized for excessive capital letters");
  });

  it("scores empty or whitespace-only title as 0 points", () => {
    expect(scoreTitle("").score).toBe(0);
    expect(scoreTitle("    ").score).toBe(0);
  });
});

describe("News Scoring - URL Quality", () => {
  it("scores HTTPS URL with specific article path structure (15 points)", () => {
    const url = "https://reputable-news.example/economy/2026/rates-hold-decision";
    const result = scoreUrl(url);
    expect(result.score).toBe(15); // 8 + 7
    expect(result.reason).toContain("Secure HTTPS");
    expect(result.reason).toContain("Specific article path");
  });

  it("scores HTTP URL with shallow path with lower points", () => {
    const url = "http://news.example/economy";
    const result = scoreUrl(url);
    expect(result.score).toBe(6); // 3 + 3
  });

  it("scores root domain URL as 0 points for path structure", () => {
    const url = "https://news.example/";
    const result = scoreUrl(url);
    expect(result.score).toBe(8); // 8 protocol + 0 path
  });

  it("scores malformed URL as 0 points", () => {
    expect(scoreUrl("not-a-valid-url").score).toBe(0);
  });
});

describe("News Scoring - Total Score & Deterministic Ordering", () => {
  const sampleCandidate: NormalizedArticleCandidate = {
    title: "Global Climate Summit Reaches Binding Renewable Energy Agreement",
    canonicalUrl: "https://globalnews.example/world/climate-summit-2026-agreement",
    externalId: "summit-2026-001",
    rawPublishedAt: new Date("2026-10-12T10:00:00Z"),
    summary:
      "Delegates from over one hundred nations voted today to enact mandatory regional targets for solar and wind energy deployment over the coming decade. The pact represents the first binding multilateral protocol with established financial enforcement mechanisms.",
    author: "Elena Rostova",
    contentHash: "hash-001",
  };

  const sampleSource = { id: "src-1", name: "Global News Wire" };
  const refTime = new Date("2026-10-12T12:00:00Z");

  it("produces identical scores and explanations on repeated runs (deterministic)", () => {
    const run1 = scoreArticleCandidate(sampleCandidate, sampleSource, refTime);
    const run2 = scoreArticleCandidate(sampleCandidate, sampleSource, refTime);

    expect(run1.score).toBe(run2.score);
    expect(run1.score).toBeGreaterThanOrEqual(80);
    expect(run1.signals).toEqual(run2.signals);
  });

  it("respects default scoring weights", () => {
    expect(DEFAULT_SCORING_WEIGHTS.maxRecency).toBe(35);
    expect(DEFAULT_SCORING_WEIGHTS.maxCompleteness).toBe(30);
    expect(DEFAULT_SCORING_WEIGHTS.maxTitle).toBe(20);
    expect(DEFAULT_SCORING_WEIGHTS.maxUrl).toBe(15);
  });

  it("implements stable tie-breaking order", () => {
    const candidateA: ScoredArticleCandidate = {
      candidate: { ...sampleCandidate, canonicalUrl: "https://news.example/article-a" },
      sourceId: "src-1",
      sourceName: "Source 1",
      score: 85,
      signals: {} as ScoredArticleCandidate["signals"],
    };

    const candidateB: ScoredArticleCandidate = {
      candidate: { ...sampleCandidate, canonicalUrl: "https://news.example/article-b" },
      sourceId: "src-2",
      sourceName: "Source 2",
      score: 90,
      signals: {} as ScoredArticleCandidate["signals"],
    };

    const candidateC: ScoredArticleCandidate = {
      candidate: { ...sampleCandidate, canonicalUrl: "https://news.example/article-c" },
      sourceId: "src-3",
      sourceName: "Source 3",
      score: 85,
      signals: {} as ScoredArticleCandidate["signals"],
    };

    // Higher score comes first: B (90) before A (85)
    expect(compareScoredCandidates(candidateA, candidateB)).toBeGreaterThan(0);
    expect(compareScoredCandidates(candidateB, candidateA)).toBeLessThan(0);

    // Equal scores: sorted alphabetically by canonicalUrl
    // "article-a" < "article-c"
    expect(compareScoredCandidates(candidateA, candidateC)).toBeLessThan(0);
    expect(compareScoredCandidates(candidateC, candidateA)).toBeGreaterThan(0);
  });
});
