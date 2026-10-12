import { describe, expect, it } from "vitest";
import {
  computeTokenJaccardSimilarity,
  deduplicateCandidates,
  extractSignificantTokens,
  normalizeTitleForComparison,
} from "@/lib/news/deduplicator";
import type { ScoredArticleCandidate } from "@/lib/news/scoring";

function createMockCandidate(overrides: Partial<ScoredArticleCandidate> & {
  title: string;
  canonicalUrl: string;
  externalId?: string | null;
}): ScoredArticleCandidate {
  const publishedAt = overrides.candidate?.rawPublishedAt ?? new Date("2026-10-12T10:00:00Z");

  return {
    candidate: {
      title: overrides.title,
      canonicalUrl: overrides.canonicalUrl,
      externalId: overrides.externalId ?? overrides.candidate?.externalId ?? null,
      rawPublishedAt: publishedAt,
      summary: overrides.candidate?.summary ?? "A detailed news article summary.",
      author: overrides.candidate?.author ?? "Staff Reporter",
      contentHash: overrides.candidate?.contentHash ?? "hash-123",
      ...overrides.candidate,
    },
    sourceId: overrides.sourceId ?? "src-default",
    sourceName: overrides.sourceName ?? "Default News Source",
    score: overrides.score ?? 75,
    signals: overrides.signals ?? ({
      recencyScore: 25,
      recencyReason: "Within 24h",
      completenessScore: 24,
      completenessReason: "Complete",
      titleScore: 16,
      titleReason: "Standard",
      urlScore: 15,
      urlReason: "HTTPS Deep",
      totalScore: overrides.score ?? 75,
    }),
  };
}

describe("News Deduplication - Utilities", () => {
  it("normalizes titles consistently for comparison", () => {
    const raw = "Breaking: Tech Giants Report 20% Surge in AI Cloud Revenue!";
    const norm = normalizeTitleForComparison(raw);
    expect(norm).toBe("breaking tech giants report 20 surge in ai cloud revenue");
  });

  it("extracts significant tokens filtering out stopwords and short words", () => {
    const title = "The Federal Government of Nigeria Signs Major Transport Accord with France";
    const tokens = extractSignificantTokens(title);
    expect(tokens).toContain("federal");
    expect(tokens).toContain("government");
    expect(tokens).toContain("nigeria");
    expect(tokens).toContain("signs");
    expect(tokens).toContain("transport");
    expect(tokens).toContain("accord");
    expect(tokens).toContain("france");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("of");
    expect(tokens).not.toContain("with");
  });

  it("computes token Jaccard similarity accurately", () => {
    const tokensA = ["climate", "summit", "reaches", "historic", "treaty", "emissions"];
    const tokensB = ["climate", "summit", "signs", "historic", "agreement", "emissions"];
    const { similarity, sharedCount } = computeTokenJaccardSimilarity(tokensA, tokensB);

    // Shared: climate, summit, historic, emissions (4 tokens)
    // Union: 4 + 2 + 2 = 8 tokens
    // Jaccard: 4 / 8 = 0.50
    expect(sharedCount).toBe(4);
    expect(similarity).toBe(0.5);
  });
});

describe("News Deduplication - Exact Duplicates", () => {
  it("detects exact canonical URL duplicates and preserves attribution", () => {
    const candidate1 = createMockCandidate({
      title: "Telecom Provider Launches Satellite Internet in Rural Areas",
      canonicalUrl: "https://technews.example/satellite-internet",
      sourceId: "src-tech-a",
      sourceName: "Tech Source A",
      score: 85,
    });

    const candidate2 = createMockCandidate({
      title: "Telecom Provider Launches Satellite Internet in Rural Areas (Republished)",
      canonicalUrl: "https://technews.example/satellite-internet?utm_source=rss&utm_medium=feed",
      sourceId: "src-tech-b",
      sourceName: "Tech Source B",
      score: 70,
    });

    const result = deduplicateCandidates([candidate1, candidate2]);

    expect(result.uniqueCandidates).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.reason).toBe("EXACT_CANONICAL_URL");

    // Highest scored candidate is retained as primary
    expect(result.uniqueCandidates[0]?.sourceName).toBe("Tech Source A");
    expect(result.duplicates[0]?.primaryCandidate.sourceName).toBe("Tech Source A");
    expect(result.duplicates[0]?.duplicateCandidate.sourceName).toBe("Tech Source B");
  });

  it("detects exact external ID duplicates from the same source", () => {
    const candidate1 = createMockCandidate({
      title: "Aviation Agency Inspects New Airport Runway",
      canonicalUrl: "https://aviation.example/runway-inspection",
      sourceId: "src-aviation",
      externalId: "guid-aviation-9988",
      score: 80,
    });

    const candidate2 = createMockCandidate({
      title: "Aviation Agency Inspects New Airport Runway - Early Draft",
      canonicalUrl: "https://aviation.example/runway-inspection-draft",
      sourceId: "src-aviation",
      externalId: "guid-aviation-9988",
      score: 65,
    });

    const result = deduplicateCandidates([candidate1, candidate2]);

    expect(result.uniqueCandidates).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.reason).toBe("EXACT_SOURCE_EXTERNAL_ID");
  });

  it("detects exact normalized title duplicates across different sources", () => {
    const candidate1 = createMockCandidate({
      title: "Central Bank Raises Benchmark Interest Rate to Thirteen Percent",
      canonicalUrl: "https://source1.example/rates-increase-13",
      sourceId: "src-1",
      score: 82,
    });

    const candidate2 = createMockCandidate({
      title: "Central Bank Raises Benchmark Interest Rate to Thirteen Percent",
      canonicalUrl: "https://source2.example/central-bank-rate-hike",
      sourceId: "src-2",
      score: 78,
    });

    const result = deduplicateCandidates([candidate1, candidate2]);

    expect(result.uniqueCandidates).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.reason).toBe("EXACT_NORMALIZED_TITLE");
    expect(result.uniqueCandidates[0]?.sourceId).toBe("src-1");
  });
});

describe("News Deduplication - Fuzzy Cross-Source & Boundary Cases", () => {
  it("detects high-confidence fuzzy duplicates with close publication dates", () => {
    // 5 shared significant words: national, railway, company, completes, electrification
    // High Jaccard similarity >= 0.82
    const candidate1 = createMockCandidate({
      title: "National Railway Company Completes Suburban Electrification Project",
      canonicalUrl: "https://news1.example/rail-electrification",
      score: 85,
    });

    const candidate2 = createMockCandidate({
      title: "National Railway Company Successfully Completes Suburban Electrification",
      canonicalUrl: "https://news2.example/rail-electrification-suburban",
      score: 75,
    });

    const result = deduplicateCandidates([candidate1, candidate2]);

    expect(result.uniqueCandidates).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.reason).toBe("HIGH_TITLE_SIMILARITY");
  });

  it("avoids merging distinct stories describing different events even with similar wording", () => {
    // Both share words like "President", "Signs", "Reform", "Capital" but describe completely different actions
    const candidate1 = createMockCandidate({
      title: "President Signs Major Agricultural Tax Reform In Capital",
      canonicalUrl: "https://news1.example/agri-tax-reform",
      score: 80,
    });

    const candidate2 = createMockCandidate({
      title: "President Vetoes Controversial Healthcare Insurance Reform In Capital",
      canonicalUrl: "https://news2.example/healthcare-reform-veto",
      score: 80,
    });

    const result = deduplicateCandidates([candidate1, candidate2]);

    // Conservative rule: Do NOT merge them! Both must remain unique
    expect(result.uniqueCandidates).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("flags moderate similarity for review without discarding either candidate", () => {
    const candidate1 = createMockCandidate({
      title: "State Electric Utility Announces Grid Modernization Investment Plan",
      canonicalUrl: "https://news1.example/grid-modernization",
      score: 80,
    });

    const candidate2 = createMockCandidate({
      title: "Electric Utility Grid Modernization Receives Federal Approval",
      canonicalUrl: "https://news2.example/utility-federal-approval",
      score: 75,
    });

    const result = deduplicateCandidates([candidate1, candidate2]);

    // Retained both as unique candidates
    expect(result.uniqueCandidates).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
    // Flagged in reviewCandidates
    expect(result.reviewCandidates.length).toBeGreaterThanOrEqual(1);
    expect(result.reviewCandidates[0]?.reason).toContain("editorial review");
  });

  it("uses deterministic tie-breaking when two duplicates have identical scores", () => {
    const candidateA = createMockCandidate({
      title: "Maritime Security Forces Intercept Contraband Cargo Vessel Off Coastal Waters",
      canonicalUrl: "https://news.example/alpha-vessel-seizure",
      score: 80,
    });

    const candidateB = createMockCandidate({
      title: "Maritime Security Forces Intercept Contraband Cargo Vessel Off Coastal Waters",
      canonicalUrl: "https://news.example/beta-vessel-seizure",
      score: 80,
    });

    // "alpha" comes before "beta" alphabetically
    const result = deduplicateCandidates([candidateB, candidateA]);
    expect(result.uniqueCandidates[0]?.candidate.canonicalUrl).toBe("https://news.example/alpha-vessel-seizure");
    expect(result.duplicates[0]?.duplicateCandidate.candidate.canonicalUrl).toBe(
      "https://news.example/beta-vessel-seizure",
    );
  });
});
