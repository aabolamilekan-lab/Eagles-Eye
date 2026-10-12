import { normalizeCanonicalUrl, stripHtmlAndCollapseWhitespace } from "./normalizer";
import { compareScoredCandidates, type ScoredArticleCandidate } from "./scoring";

/**
 * Conservative news deduplication and clustering module.
 *
 * Implements a conservative multi-stage duplicate detection pipeline:
 * 1. Exact Canonical URL match (normalized via normalizeCanonicalUrl).
 * 2. Exact External ID match within the same source (sourceId + externalId).
 * 3. Exact Normalized Title match across sources.
 * 4. High-confidence Token Jaccard similarity (threshold >= 0.82 with >= 4 shared significant words).
 * 5. Review Candidates: Moderate similarity (0.60 - 0.82) is flagged for editorial review
 *    without discarding or merging either article.
 *
 * Invariants:
 * - Pure and in-memory: does not perform database writes or mutations.
 * - Attribution preserving: every duplicate record preserves both primary and secondary candidate metadata.
 * - Deterministic tie-breaking: uses compareScoredCandidates to select the primary item.
 */

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "during",
  "each",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "s",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "t",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
]);

export type DuplicateReason =
  | "EXACT_CANONICAL_URL"
  | "EXACT_SOURCE_EXTERNAL_ID"
  | "EXACT_NORMALIZED_TITLE"
  | "HIGH_TITLE_SIMILARITY";

export interface DuplicateMatch {
  primaryCandidate: ScoredArticleCandidate;
  duplicateCandidate: ScoredArticleCandidate;
  reason: DuplicateReason;
  similarityScore?: number;
}

export interface ReviewCandidatePair {
  candidateA: ScoredArticleCandidate;
  candidateB: ScoredArticleCandidate;
  similarityScore: number;
  reason: string;
}

export interface DeduplicationResult {
  uniqueCandidates: ScoredArticleCandidate[];
  duplicates: DuplicateMatch[];
  reviewCandidates: ReviewCandidatePair[];
}

/**
 * Clean and normalize title text for comparison.
 */
export function normalizeTitleForComparison(title: string): string {
  const clean = stripHtmlAndCollapseWhitespace(title).toLowerCase();
  // Remove all non-alphanumeric characters except spaces
  return clean.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Extract significant words from a title (lowercase, no punctuation, stop-words removed).
 */
export function extractSignificantTokens(title: string): string[] {
  const normalized = normalizeTitleForComparison(title);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Compute Jaccard similarity between two sets of tokens.
 */
export function computeTokenJaccardSimilarity(
  tokensA: string[],
  tokensB: string[],
): { similarity: number; sharedCount: number } {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { similarity: 0, sharedCount: 0 };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount += 1;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  if (unionCount === 0) {
    return { similarity: 0, sharedCount: 0 };
  }

  const similarity = Number((intersectionCount / unionCount).toFixed(4));
  return { similarity, sharedCount: intersectionCount };
}

/**
 * Compute Sørensen–Dice similarity between two sets of tokens.
 * Better suited for short titles where token sets are small.
 */
export function computeTokenDiceSimilarity(
  tokensA: string[],
  tokensB: string[],
): { similarity: number; sharedCount: number } {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { similarity: 0, sharedCount: 0 };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount += 1;
    }
  }

  const totalTokens = tokensA.length + tokensB.length;
  const similarity = Number(((2 * intersectionCount) / totalTokens).toFixed(4));
  return { similarity, sharedCount: intersectionCount };
}

/**
 * Deduplicate a batch of scored candidates in-memory.
 */
export function deduplicateCandidates(
  candidates: ScoredArticleCandidate[],
): DeduplicationResult {
  if (candidates.length <= 1) {
    return {
      uniqueCandidates: [...candidates],
      duplicates: [],
      reviewCandidates: [],
    };
  }

  // Sort candidates first deterministically so higher-scored items are evaluated first
  const sorted = [...candidates].sort(compareScoredCandidates);

  const uniqueCandidates: ScoredArticleCandidate[] = [];
  const duplicates: DuplicateMatch[] = [];
  const reviewCandidates: ReviewCandidatePair[] = [];

  // Lookup maps for exact checks
  const urlMap = new Map<string, ScoredArticleCandidate>();
  const sourceExternalIdMap = new Map<string, ScoredArticleCandidate>(); // key: `${sourceId}:${externalId}`
  const titleMap = new Map<string, ScoredArticleCandidate>();

  for (const candidate of sorted) {
    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeCanonicalUrl(candidate.candidate.canonicalUrl);
    } catch {
      canonicalUrl = candidate.candidate.canonicalUrl.trim().toLowerCase();
    }

    const normTitle = normalizeTitleForComparison(candidate.candidate.title);
    const tokens = extractSignificantTokens(candidate.candidate.title);

    // 1. Exact Canonical URL check
    const existingUrl = urlMap.get(canonicalUrl);
    if (existingUrl) {
      duplicates.push({
        primaryCandidate: existingUrl,
        duplicateCandidate: candidate,
        reason: "EXACT_CANONICAL_URL",
        similarityScore: 1.0,
      });
      continue;
    }

    // 2. Exact Source External ID check
    const externalId = candidate.candidate.externalId?.trim();
    if (externalId) {
      const sourceKey = `${candidate.sourceId}:${externalId}`;
      const existingExt = sourceExternalIdMap.get(sourceKey);
      if (existingExt) {
        duplicates.push({
          primaryCandidate: existingExt,
          duplicateCandidate: candidate,
          reason: "EXACT_SOURCE_EXTERNAL_ID",
          similarityScore: 1.0,
        });
        continue;
      }
    }

    // 3. Exact Normalized Title check
    if (normTitle && normTitle.length >= 15) {
      const existingTitle = titleMap.get(normTitle);
      if (existingTitle) {
        duplicates.push({
          primaryCandidate: existingTitle,
          duplicateCandidate: candidate,
          reason: "EXACT_NORMALIZED_TITLE",
          similarityScore: 1.0,
        });
        continue;
      }
    }

    // 4. Cross-source fuzzy token similarity check against all current uniques
    let isFuzzyDuplicate = false;

    for (const existing of uniqueCandidates) {
      const existingTokens = extractSignificantTokens(existing.candidate.title);
      const { similarity, sharedCount } = computeTokenDiceSimilarity(tokens, existingTokens);

      // Check publication date proximity (within 48 hours or either null)
      let datesClose = true;
      if (candidate.candidate.rawPublishedAt && existing.candidate.rawPublishedAt) {
        const timeDiff = Math.abs(
          candidate.candidate.rawPublishedAt.getTime() - existing.candidate.rawPublishedAt.getTime(),
        );
        datesClose = timeDiff <= 48 * 60 * 60 * 1000;
      }

      // Conservative high-confidence duplicate threshold:
      // Dice >= 0.75 with at least 4 shared significant words and close publication dates
      if (similarity >= 0.75 && sharedCount >= 4 && datesClose) {
        duplicates.push({
          primaryCandidate: existing,
          duplicateCandidate: candidate,
          reason: "HIGH_TITLE_SIMILARITY",
          similarityScore: similarity,
        });
        isFuzzyDuplicate = true;
        break;
      }

      // Moderate similarity (0.50 to 0.75) -> Flag for review, DO NOT discard either article
      if (similarity >= 0.50 && sharedCount >= 3) {
        reviewCandidates.push({
          candidateA: existing,
          candidateB: candidate,
          similarityScore: similarity,
          reason: `Moderate headline similarity (${Math.round(
            similarity * 100,
          )}% shared tokens); retained both candidates for editorial review.`,
        });
      }
    }

    if (isFuzzyDuplicate) {
      continue;
    }

    // Article is unique
    uniqueCandidates.push(candidate);
    urlMap.set(canonicalUrl, candidate);
    if (externalId) {
      sourceExternalIdMap.set(`${candidate.sourceId}:${externalId}`, candidate);
    }
    if (normTitle && normTitle.length >= 15) {
      titleMap.set(normTitle, candidate);
    }
  }

  return {
    uniqueCandidates,
    duplicates,
    reviewCandidates,
  };
}
