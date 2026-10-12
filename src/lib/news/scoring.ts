import { stripHtmlAndCollapseWhitespace } from "./normalizer";
import type { NormalizedArticleCandidate } from "./types";

/**
 * Deterministic, explainable news candidate scoring module.
 *
 * Evaluates candidates along 4 objective dimensions (0 - 100 points total):
 * 1. Publication Recency (max 35 pts)
 * 2. Content Completeness (max 30 pts)
 * 3. Title Quality (max 20 pts)
 * 4. Canonical URL Quality (max 15 pts)
 *
 * Scoring invariants:
 * - Deterministic: identical inputs produce identical scores and explanations.
 * - Neutral on missing/future dates: does not crash, assigns baseline score.
 * - No fabricated credibility: does not invent subjective source authority ratings.
 * - No repetition bias: does not artificially inflate score just because multiple feeds carry it.
 */

export interface ScoringWeights {
  maxRecency: number;
  maxCompleteness: number;
  maxTitle: number;
  maxUrl: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  maxRecency: 35,
  maxCompleteness: 30,
  maxTitle: 20,
  maxUrl: 15,
};

export interface ScoringSignals {
  recencyScore: number;
  recencyReason: string;
  completenessScore: number;
  completenessReason: string;
  titleScore: number;
  titleReason: string;
  urlScore: number;
  urlReason: string;
  totalScore: number;
}

export interface ScoredArticleCandidate {
  candidate: NormalizedArticleCandidate;
  sourceId: string;
  sourceName: string;
  score: number; // 0 to 100
  signals: ScoringSignals;
}

/**
 * Calculate recency score (0 - 35 points).
 */
export function scoreRecency(
  publishedAt: Date | null | undefined,
  now: Date = new Date(),
): { score: number; reason: string } {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
    return {
      score: 15,
      reason: "Missing or invalid publication date; assigned neutral baseline recency score (15/35).",
    };
  }

  const ageMs = now.getTime() - publishedAt.getTime();

  // If date is more than 2 hours in the future, treat as clock skew / suspect
  if (ageMs < -2 * 60 * 60 * 1000) {
    return {
      score: 10,
      reason: "Publication date is in the future; assigned conservative baseline score (10/35).",
    };
  }

  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));

  if (ageHours <= 6) {
    return { score: 35, reason: "Published within 6 hours (35/35)." };
  }
  if (ageHours <= 12) {
    return { score: 30, reason: "Published within 12 hours (30/35)." };
  }
  if (ageHours <= 24) {
    return { score: 25, reason: "Published within 24 hours (25/35)." };
  }
  if (ageHours <= 48) {
    return { score: 18, reason: "Published within 48 hours (18/35)." };
  }
  if (ageHours <= 72) {
    return { score: 10, reason: "Published within 3 days (10/35)." };
  }
  if (ageHours <= 168) {
    // 7 days
    return { score: 5, reason: "Published within 7 days (5/35)." };
  }

  return { score: 0, reason: "Published more than 7 days ago (0/35)." };
}

/**
 * Calculate content completeness score (0 - 30 points).
 */
export function scoreCompleteness(
  summary: string | null | undefined,
  author: string | null | undefined,
  externalId: string | null | undefined,
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const cleanSummary = stripHtmlAndCollapseWhitespace(summary);
  const wordCount = cleanSummary ? cleanSummary.split(/\s+/).filter(Boolean).length : 0;

  if (wordCount >= 100) {
    score += 18;
    reasons.push(`Substantive summary (${wordCount} words, 18/18)`);
  } else if (wordCount >= 40) {
    score += 12;
    reasons.push(`Moderate summary (${wordCount} words, 12/18)`);
  } else if (wordCount >= 15) {
    score += 6;
    reasons.push(`Brief summary (${wordCount} words, 6/18)`);
  } else {
    reasons.push(`Sparse or missing summary (${wordCount} words, 0/18)`);
  }

  if (author && author.trim().length > 0) {
    score += 6;
    reasons.push("Author attributed (6/6)");
  } else {
    reasons.push("No author attribution (0/6)");
  }

  if (externalId && externalId.trim().length > 0) {
    score += 6;
    reasons.push("External identifier present (6/6)");
  } else {
    reasons.push("No external identifier (0/6)");
  }

  return {
    score,
    reason: reasons.join("; "),
  };
}

/**
 * Calculate title quality score (0 - 20 points).
 */
export function scoreTitle(rawTitle: string): { score: number; reason: string } {
  const cleanTitle = stripHtmlAndCollapseWhitespace(rawTitle);
  if (!cleanTitle) {
    return { score: 0, reason: "Empty or whitespace-only title (0/20)." };
  }

  let score = 0;
  const reasons: string[] = [];
  const charLength = cleanTitle.length;

  // Length scoring (up to 12 points)
  if (charLength >= 40 && charLength <= 150) {
    score += 12;
    reasons.push(`Ideal headline length (${charLength} chars, 12/12)`);
  } else if ((charLength >= 20 && charLength < 40) || (charLength > 150 && charLength <= 220)) {
    score += 8;
    reasons.push(`Acceptable headline length (${charLength} chars, 8/12)`);
  } else {
    score += 2;
    reasons.push(`Suboptimal headline length (${charLength} chars, 2/12)`);
  }

  // Capitalization check (up to 8 points)
  const letters = cleanTitle.replace(/[^a-zA-Z]/g, "");
  const upperCount = cleanTitle.replace(/[^A-Z]/g, "").length;
  const isAllCaps = letters.length > 20 && upperCount / letters.length > 0.7;

  if (isAllCaps) {
    reasons.push("Penalized for excessive capital letters / clickbait formatting (0/8)");
  } else {
    score += 8;
    reasons.push("Standard headline casing (8/8)");
  }

  return {
    score,
    reason: reasons.join("; "),
  };
}

/**
 * Calculate canonical URL quality score (0 - 15 points).
 */
export function scoreUrl(canonicalUrl: string): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  try {
    const parsed = new URL(canonicalUrl);

    if (parsed.protocol === "https:") {
      score += 8;
      reasons.push("Secure HTTPS protocol (8/8)");
    } else if (parsed.protocol === "http:") {
      score += 3;
      reasons.push("Standard HTTP protocol (3/8)");
    } else {
      reasons.push("Non-standard protocol (0/8)");
    }

    const pathname = parsed.pathname;
    const pathSegments = pathname.split("/").filter(Boolean);
    const firstSegment = pathSegments[0];

    if (pathSegments.length >= 2 || (pathSegments.length === 1 && (firstSegment?.length ?? 0) >= 10)) {
      score += 7;
      reasons.push("Specific article path structure (7/7)");
    } else if (pathSegments.length === 1) {
      score += 3;
      reasons.push("Shallow article path structure (3/7)");
    } else {
      reasons.push("Root or near-root homepage URL (0/7)");
    }
  } catch {
    return { score: 0, reason: "Malformed canonical URL (0/15)." };
  }

  return {
    score,
    reason: reasons.join("; "),
  };
}

/**
 * Score a single candidate deterministically.
 */
export function scoreArticleCandidate(
  candidate: NormalizedArticleCandidate,
  source: { id: string; name: string },
  now: Date = new Date(),
): ScoredArticleCandidate {
  const recency = scoreRecency(candidate.rawPublishedAt, now);
  const completeness = scoreCompleteness(candidate.summary, candidate.author, candidate.externalId);
  const title = scoreTitle(candidate.title);
  const url = scoreUrl(candidate.canonicalUrl);

  const totalScore = Math.min(100, Math.max(0, recency.score + completeness.score + title.score + url.score));

  const signals: ScoringSignals = {
    recencyScore: recency.score,
    recencyReason: recency.reason,
    completenessScore: completeness.score,
    completenessReason: completeness.reason,
    titleScore: title.score,
    titleReason: title.reason,
    urlScore: url.score,
    urlReason: url.reason,
    totalScore,
  };

  return {
    candidate,
    sourceId: source.id,
    sourceName: source.name,
    score: totalScore,
    signals,
  };
}

/**
 * Stable, deterministic tie-breaking comparator for scored candidates.
 *
 * Sort order:
 * 1. Score descending (highest score first)
 * 2. Published date descending (most recent first; nulls last)
 * 3. Canonical URL ascending (alphabetical tie-breaker)
 */
export function compareScoredCandidates(
  a: ScoredArticleCandidate,
  b: ScoredArticleCandidate,
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const timeA = a.candidate.rawPublishedAt ? a.candidate.rawPublishedAt.getTime() : -1;
  const timeB = b.candidate.rawPublishedAt ? b.candidate.rawPublishedAt.getTime() : -1;
  if (timeB !== timeA) {
    return timeB - timeA;
  }

  return a.candidate.canonicalUrl.localeCompare(b.candidate.canonicalUrl);
}
