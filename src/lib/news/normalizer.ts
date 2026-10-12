import crypto from "node:crypto";

/**
 * Deterministic URL normalizer and content hashing utilities.
 *
 * Provides reproducible deduplication keys for external articles:
 * 1. Strips marketing/click-tracking query parameters while preserving
 *    legitimate resource identifiers (e.g. id, articleId, path).
 * 2. Normalizes protocol casing, host casing, default ports, and trailing slashes.
 * 3. Sorts query parameters deterministically.
 * 4. Generates SHA-256 content hashes to detect external updates.
 */

const TRACKING_PARAMS = new Set([
  // Google / UTM
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_creative",
  "utm_reader",
  "gclid",
  "gclsrc",
  "dclid",
  "_ga",
  "_gl",

  // Facebook / Meta
  "fbclid",
  "fbadid",

  // Twitter / X
  "twclid",

  // Microsoft / Bing
  "msclkid",

  // Mailchimp / Email
  "mc_cid",
  "mc_eid",
  "mkt_tok",

  // Instagram / Social
  "igshid",

  // Yandex
  "yclid",

  // Generic referral & feed trackers
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "feature",
  "feedtype",
  "feedname",
  "spm",
  "zanpid",
]);

/**
 * Normalize an external article URL into a deterministic canonical form.
 *
 * Fails closed (throws Error) if the URL is malformed or uses an unsupported protocol.
 */
export function normalizeCanonicalUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("URL must be a non-empty string");
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Malformed URL: "${rawUrl}"`);
  }

  // Protocol normalization: strictly HTTP or HTTPS
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: "${parsed.protocol}"`);
  }

  // Hostname normalization: lowercase
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error(`Missing hostname in URL: "${rawUrl}"`);
  }

  // Strip standard default ports
  let port = parsed.port;
  if ((protocol === "http:" && port === "80") || (protocol === "https:" && port === "443")) {
    port = "";
  }

  // Path normalization: collapse multiple consecutive slashes and remove trailing slash
  let pathname = parsed.pathname.replace(/\/+/g, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // Query parameter normalization: strip known tracking tokens
  const cleanParams = new URLSearchParams();
  const sortedKeys = Array.from(new Set(parsed.searchParams.keys())).sort();

  for (const key of sortedKeys) {
    const lowerKey = key.toLowerCase();
    if (!TRACKING_PARAMS.has(lowerKey)) {
      const values = parsed.searchParams.getAll(key);
      for (const val of values) {
        cleanParams.append(key, val);
      }
    }
  }

  const queryString = cleanParams.toString();
  const hostWithPort = port ? `${hostname}:${port}` : hostname;
  const searchPart = queryString ? `?${queryString}` : "";

  return `${protocol}//${hostWithPort}${pathname}${searchPart}`;
}

/**
 * Strip raw HTML tags, discard script/style contents, and collapse whitespace from feed text.
 */
export function stripHtmlAndCollapseWhitespace(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute a deterministic SHA-256 content hash of normalized title and summary.
 *
 * Used to detect when a publisher publishes a substantive update to an existing article.
 */
export function computeContentHash(title: string, summary: string | null): string {
  const cleanTitle = stripHtmlAndCollapseWhitespace(title).toLowerCase();
  const cleanSummary = stripHtmlAndCollapseWhitespace(summary).toLowerCase();
  const payload = `${cleanTitle}\n${cleanSummary}`;

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Sanitize and clamp a text snippet to a maximum character length on a word boundary.
 */
export function sanitizeTextSnippet(
  raw: string | null | undefined,
  maxLength: number = 5000,
): string | null {
  const clean = stripHtmlAndCollapseWhitespace(raw);
  if (!clean) {
    return null;
  }
  if (clean.length <= maxLength) {
    return clean;
  }

  const clipped = clean.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
}
