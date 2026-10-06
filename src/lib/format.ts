/**
 * Deterministic formatting for the reader surface.
 *
 * Dates are formatted with a fixed locale and time zone so server and client
 * cannot disagree, and so two servers in different regions produce the same
 * string. No relative timestamps: those are unstable and cause hydration
 * mismatches. Server-side only (AGENTS.md section 16;
 * .agent/skills/reader-experience/SKILL.md).
 */

const PUBLISHED_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Formats an ISO string or Date as a long, human date.
 *
 * Returns `null` for absent or unparseable input so a caller omits the element
 * rather than rendering "Invalid Date".
 */
export function formatPublishedDate(
  value: string | Date | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return PUBLISHED_DATE.format(date);
}

const TAG = /<[^>]*>/g;
const WHITESPACE = /\s+/g;

/**
 * Derive plain text from sanitized rich text for metadata and search.
 *
 * Drops tags and collapses whitespace. This is display text, not a security
 * boundary: the caller passes already-sanitized HTML, and the output is never
 * re-inserted as markup. Truncation happens on a word boundary so a
 * description never ends mid-word.
 */
export function toPlainTextExcerpt(
  html: string | null | undefined,
  maxLength = 160,
): string {
  if (!html) return "";

  const text = html.replace(TAG, " ").replace(WHITESPACE, " ").trim();
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
}
