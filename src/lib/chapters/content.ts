import { toPlainTextExcerpt } from "@/lib/format";

/** Whitespace-only HTML entities that must not count as a chapter body. */
const BLANK_ENTITY = /&(?:nbsp|#160|#xa0|zwj|zwnj);/gi;

/**
 * Does sanitized chapter HTML carry any readable body text?
 *
 * The editor's output is untrusted and is stored sanitized, but a chapter can
 * still be an empty paragraph or a run of non-breaking spaces. Publishing such
 * a chapter is rejected, so the check strips tags (via the shared excerpt
 * helper), drops whitespace entities, and looks for any remaining text.
 * `.agent/skills/chapter-management/SKILL.md`.
 */
export function isChapterContentEmpty(sanitizedHtml: string | null): boolean {
  if (!sanitizedHtml) {
    return true;
  }
  const text = toPlainTextExcerpt(sanitizedHtml).replace(BLANK_ENTITY, "").trim();
  return text === "";
}
