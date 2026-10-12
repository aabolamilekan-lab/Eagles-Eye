/**
 * Structured attribution policy parsed from NewsSource.attributionPolicy.
 */
export interface StructuredAttributionPolicy {
  licenseName: string | null;
  licenseUrl: string | null;
  statement: string;
  isPublicDomain?: boolean;
  policyUrl?: string | null;
}

export interface StorySourceAttributionData {
  publisher: string;
  originalTitle: string;
  canonicalUrl: string;
  originalAuthor: string | null;
  attributionPolicy: string | null;
}

export interface ParsedAttributionViewModel {
  publisher: string;
  originalTitle: string;
  canonicalUrl: string;
  originalAuthor: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  statement: string;
  isPublicDomain: boolean;
  policyUrl: string | null;
  isAiSummaryNotice: string;
}

const DEFAULT_AI_SUMMARY_NOTICE =
  "This story is an editorial summary synthesized with AI from original reporting for reader discovery. External media and third-party photographs are excluded.";

/**
 * Robustly parse an attribution policy from database storage.
 *
 * Supports structured JSON payloads and gracefully handles plain text,
 * malformed JSON, and null values without throwing or creating unverified claims.
 */
export function parseAttributionPolicy(raw: string | null | undefined): StructuredAttributionPolicy {
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    return {
      licenseName: null,
      licenseUrl: null,
      statement: "Attribution information not specified.",
      isPublicDomain: false,
      policyUrl: null,
    };
  }

  const trimmed = raw.trim();

  // Attempt JSON parse
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const licenseName = typeof parsed.licenseName === "string" && parsed.licenseName.trim()
        ? parsed.licenseName.trim()
        : null;
      const licenseUrl = typeof parsed.licenseUrl === "string" && parsed.licenseUrl.trim().startsWith("http")
        ? parsed.licenseUrl.trim()
        : null;
      const statement = typeof parsed.statement === "string" && parsed.statement.trim()
        ? parsed.statement.trim()
        : (typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : trimmed);
      const isPublicDomain = Boolean(parsed.isPublicDomain);
      const policyUrl = typeof parsed.policyUrl === "string" && parsed.policyUrl.trim().startsWith("http")
        ? parsed.policyUrl.trim()
        : null;

      return {
        licenseName,
        licenseUrl,
        statement,
        isPublicDomain,
        policyUrl,
      };
    } catch {
      // Malformed JSON falls through safely to plain text fallback
    }
  }

  // Plain-text fallback: do not invent unverified license names or URLs
  return {
    licenseName: null,
    licenseUrl: null,
    statement: trimmed,
    isPublicDomain: false,
    policyUrl: null,
  };
}

/**
 * Build a complete view model for public story attribution rendering.
 */
export function buildAttributionViewModel(
  data: StorySourceAttributionData,
): ParsedAttributionViewModel {
  const policy = parseAttributionPolicy(data.attributionPolicy);

  return {
    publisher: data.publisher,
    originalTitle: data.originalTitle,
    canonicalUrl: data.canonicalUrl,
    originalAuthor: data.originalAuthor ? data.originalAuthor.trim() || null : null,
    licenseName: policy.licenseName,
    licenseUrl: policy.licenseUrl,
    statement: policy.statement,
    isPublicDomain: Boolean(policy.isPublicDomain),
    policyUrl: policy.policyUrl ?? null,
    isAiSummaryNotice: DEFAULT_AI_SUMMARY_NOTICE,
  };
}
