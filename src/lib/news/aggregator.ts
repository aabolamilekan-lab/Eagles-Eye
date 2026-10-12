import { computeContentHash, normalizeCanonicalUrl, sanitizeTextSnippet, stripHtmlAndCollapseWhitespace } from "./normalizer";
import { deduplicateCandidates, type DeduplicationResult, type DuplicateMatch } from "./deduplicator";
import { summarizeNewsArticle } from "./gemini";
import { compareScoredCandidates, scoreArticleCandidate, type ScoredArticleCandidate } from "./scoring";
import type {
  GeminiSummarizeInput,
  GeminiSummarizeResult,
  NormalizedArticleCandidate,
  RawFeedItem,
} from "./types";

/**
 * Aggregation coordination layer (pure in-memory orchestration).
 *
 * Coordinates:
 * 1. Feed item normalization and content hashing.
 * 2. Deterministic scoring and priority ranking.
 * 3. Conservative batch deduplication.
 * 4. Bounded Gemini AI summarization for top candidates.
 *
 * Invariants:
 * - Pure: executes with zero database mutations or network requests when dependencies are injected.
 * - Robust: failures in individual feed items or AI calls do not abort unrelated items.
 * - Editorial: every proposed story is strictly DRAFT (publishedAt: null); publishing is never triggered.
 * - Isolated: Phase 3.5 only coordinates in-memory data structures; database persistence is left for Phase 3.6.
 */

export interface FeedSourceBatch {
  sourceId: string;
  sourceName: string;
  items: RawFeedItem[];
}

export interface AggregationRunOptions {
  now?: Date;
  maxArticlesPerRun?: number; // Maximum candidates to process (default 25)
  maxAiSummariesPerRun?: number; // Maximum AI calls per run to control budget/latency (default 5)
  minScoreThreshold?: number; // Minimum candidate score required for AI summarization (default 30)
  summarizeFn?: (input: GeminiSummarizeInput) => Promise<GeminiSummarizeResult>;
}

export type CandidateProcessingStatus =
  | "SUMMARIZED"
  | "AI_INSUFFICIENT_CONTENT"
  | "AI_FAILED"
  | "AI_BUDGET_EXCEEDED"
  | "LOW_SCORE_FILTERED"
  | "DUPLICATE_SKIPPED"
  | "INVALID_URL_SKIPPED";

export interface ProposedStoryDraft {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  author: string | null;
  status: "DRAFT"; // STRICT INVARIANT: Always DRAFT, never published
  publishedAt: null; // STRICT INVARIANT: Always null
  sourceName: string;
  canonicalUrl: string;
}

export interface AggregatedArticleResult {
  candidate: NormalizedArticleCandidate;
  scored: ScoredArticleCandidate;
  status: CandidateProcessingStatus;
  storyDraft?: ProposedStoryDraft;
  aiResult?: GeminiSummarizeResult;
  duplicateInfo?: {
    primaryUrl: string;
    reason: string;
  };
  rejectionOrErrorReason?: string;
}

export interface AggregationRunSummary {
  totalDiscovered: number;
  totalValid: number;
  totalUnique: number;
  totalDuplicates: number;
  totalSummarized: number;
  totalAiCalls: number;
  results: AggregatedArticleResult[];
  duplicates: DuplicateMatch[];
  reviewCandidates: DeduplicationResult["reviewCandidates"];
}

/**
 * Generate a deterministic URL slug from a title.
 */
export function generateDraftSlug(title: string): string {
  const clean = stripHtmlAndCollapseWhitespace(title).toLowerCase();
  const slug = clean
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");

  return slug || "news-story-draft";
}

/**
 * Normalize a single raw feed item into a NormalizedArticleCandidate.
 * Returns null if the item has no valid title or canonical URL.
 */
export function normalizeFeedItem(item: RawFeedItem): NormalizedArticleCandidate | null {
  const cleanTitle = stripHtmlAndCollapseWhitespace(item.title);
  if (!cleanTitle) {
    return null;
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = normalizeCanonicalUrl(item.link);
  } catch {
    return null;
  }

  const cleanSummary = sanitizeTextSnippet(item.summary, 5000);
  const cleanAuthor = sanitizeTextSnippet(item.author, 100);
  const externalId = item.guid?.trim() || null;
  const contentHash = computeContentHash(cleanTitle, cleanSummary);

  return {
    title: cleanTitle.slice(0, 300),
    canonicalUrl,
    externalId,
    rawPublishedAt: item.publishedAt,
    summary: cleanSummary,
    author: cleanAuthor,
    contentHash,
  };
}

/**
 * Coordinate a complete aggregation run in-memory.
 */
export async function coordinateAggregationRun(
  batches: FeedSourceBatch[],
  options: AggregationRunOptions = {},
): Promise<AggregationRunSummary> {
  const now = options.now ?? new Date();
  const maxArticles = options.maxArticlesPerRun ?? 25;
  const maxAiCalls = options.maxAiSummariesPerRun ?? 5;
  const minScore = options.minScoreThreshold ?? 30;
  const summarizeFn = options.summarizeFn ?? summarizeNewsArticle;

  let totalDiscovered = 0;
  const scoredCandidates: ScoredArticleCandidate[] = [];
  const invalidItems: AggregatedArticleResult[] = [];

  // 1. Discovery and Normalization
  for (const batch of batches) {
    for (const rawItem of batch.items) {
      totalDiscovered += 1;
      const normalized = normalizeFeedItem(rawItem);

      if (!normalized) {
        // Track unparseable items as discarded
        invalidItems.push({
          candidate: {
            title: rawItem.title || "Untitled",
            canonicalUrl: rawItem.link || "",
            externalId: rawItem.guid || null,
            rawPublishedAt: rawItem.publishedAt,
            summary: rawItem.summary || null,
            author: rawItem.author || null,
            contentHash: "",
          },
          scored: {
            candidate: {
              title: rawItem.title || "Untitled",
              canonicalUrl: rawItem.link || "",
              externalId: rawItem.guid || null,
              rawPublishedAt: rawItem.publishedAt,
              summary: rawItem.summary || null,
              author: rawItem.author || null,
              contentHash: "",
            },
            sourceId: batch.sourceId,
            sourceName: batch.sourceName,
            score: 0,
            signals: {
              recencyScore: 0,
              recencyReason: "Invalid or missing",
              completenessScore: 0,
              completenessReason: "Invalid or missing",
              titleScore: 0,
              titleReason: "Invalid or missing",
              urlScore: 0,
              urlReason: "Invalid canonical URL",
              totalScore: 0,
            },
          },
          status: "INVALID_URL_SKIPPED",
          rejectionOrErrorReason: "Malformed URL or empty title",
        });
        continue;
      }

      // Score candidate deterministically
      const scored = scoreArticleCandidate(normalized, { id: batch.sourceId, name: batch.sourceName }, now);
      scoredCandidates.push(scored);
    }
  }

  // 2. Conservative Deduplication
  const dedupResult = deduplicateCandidates(scoredCandidates);

  // 3. Score Ranking & Selection
  const rankedUniques = [...dedupResult.uniqueCandidates].sort(compareScoredCandidates);
  const eligibleBatch = rankedUniques.slice(0, maxArticles);

  const results: AggregatedArticleResult[] = [...invalidItems];

  // Record duplicates in the final result list
  for (const dup of dedupResult.duplicates) {
    results.push({
      candidate: dup.duplicateCandidate.candidate,
      scored: dup.duplicateCandidate,
      status: "DUPLICATE_SKIPPED",
      duplicateInfo: {
        primaryUrl: dup.primaryCandidate.candidate.canonicalUrl,
        reason: dup.reason,
      },
      rejectionOrErrorReason: `Duplicate of ${dup.primaryCandidate.candidate.canonicalUrl} (${dup.reason})`,
    });
  }

  // Record candidates that were beyond the maxArticles run cap
  const overflowCandidates = rankedUniques.slice(maxArticles);
  for (const overflow of overflowCandidates) {
    results.push({
      candidate: overflow.candidate,
      scored: overflow,
      status: "AI_BUDGET_EXCEEDED",
      rejectionOrErrorReason: "Candidate exceeded per-run article processing limit.",
    });
  }

  // 4. Summarization Processing for Eligible Candidates
  let aiCallsMade = 0;
  let totalSummarized = 0;

  for (const item of eligibleBatch) {
    // Check score threshold
    if (item.score < minScore) {
      results.push({
        candidate: item.candidate,
        scored: item,
        status: "LOW_SCORE_FILTERED",
        rejectionOrErrorReason: `Candidate score (${item.score}) below minimum threshold (${minScore}).`,
      });
      continue;
    }

    // Check AI budget
    if (aiCallsMade >= maxAiCalls) {
      results.push({
        candidate: item.candidate,
        scored: item,
        status: "AI_BUDGET_EXCEEDED",
        rejectionOrErrorReason: `Per-run AI summary budget reached (${maxAiCalls} calls).`,
      });
      continue;
    }

    // Prepare content for Gemini summarization
    const sourceContent = item.candidate.summary || item.candidate.title;

    aiCallsMade += 1;
    let aiResult: GeminiSummarizeResult;
    try {
      aiResult = await summarizeFn({
        title: item.candidate.title,
        sourceContent,
        sourceName: item.sourceName,
        canonicalUrl: item.candidate.canonicalUrl,
        author: item.candidate.author,
        publishedAt: item.candidate.rawPublishedAt,
      });
    } catch (err) {
      results.push({
        candidate: item.candidate,
        scored: item,
        status: "AI_FAILED",
        rejectionOrErrorReason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!aiResult.success) {
      results.push({
        candidate: item.candidate,
        scored: item,
        status: "AI_INSUFFICIENT_CONTENT",
        aiResult,
        rejectionOrErrorReason: aiResult.rejectionReason || "Insufficient content for grounded summary.",
      });
      continue;
    }

    // Generate proposed DRAFT story (Never published!)
    const draft: ProposedStoryDraft = {
      title: item.candidate.title,
      slug: generateDraftSlug(item.candidate.title),
      shortDescription: aiResult.shortDescription || "",
      description: `<p>${aiResult.summary}</p>`,
      author: item.candidate.author,
      status: "DRAFT", // STRICT INVARIANT: Always DRAFT
      publishedAt: null, // STRICT INVARIANT: Never published
      sourceName: item.sourceName,
      canonicalUrl: item.candidate.canonicalUrl,
    };

    totalSummarized += 1;
    results.push({
      candidate: item.candidate,
      scored: item,
      status: "SUMMARIZED",
      storyDraft: draft,
      aiResult,
    });
  }

  return {
    totalDiscovered,
    totalValid: scoredCandidates.length,
    totalUnique: dedupResult.uniqueCandidates.length,
    totalDuplicates: dedupResult.duplicates.length,
    totalSummarized,
    totalAiCalls: aiCallsMade,
    results,
    duplicates: dedupResult.duplicates,
    reviewCandidates: dedupResult.reviewCandidates,
  };
}

/**
 * Phase 3.6 Database Persistence and Lock Interface Contract.
 *
 * Outlines the database operations that Phase 3.6 will implement to persist
 * the aggregated batches produced by this coordinator.
 */
export interface NewsDatabaseSyncPort {
  acquireSyncLock(leaseDurationMs: number): Promise<{ acquired: boolean; lockId?: string }>;
  releaseSyncLock(lockId: string): Promise<boolean>;
  findExistingArticleByCanonicalUrl(
    canonicalUrl: string,
  ): Promise<{ id: string; contentHash: string; syncStatus: string } | null>;
  persistImportedArticle(data: {
    sourceId: string;
    externalId: string | null;
    canonicalUrl: string;
    title: string;
    author: string | null;
    rawPublishedAt: Date | null;
    summary: string | null;
    contentHash: string;
    syncStatus: string;
    storyDraft?: ProposedStoryDraft;
  }): Promise<{ importedArticleId: string; storyId?: string }>;
  recordSyncLog(log: {
    sourceId?: string;
    jobId: string;
    status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
    discoveredCount: number;
    importedCount: number;
    skippedCount: number;
    failedCount: number;
    durationMs: number;
  }): Promise<void>;
}
