/**
 * Client-side link destination normalisation for the editor.
 *
 * This is a UX affordance, not a security boundary: the server sanitizer in
 * `src/lib/sanitize/rich-text.ts` remains the sole authority on stored HTML
 * (AGENTS.md section 10). The job here is to stop an operator from creating an
 * executable `javascript:` link in the first place, and to normalise a typed
 * address into something usable.
 */

/** Only these schemes are ever emitted. Anything else is refused. */
const ALLOWED_SCHEME = /^(https?|mailto):/i;

/** The leading scheme, if the value carries one. */
const SCHEME = /^([a-z][a-z0-9+.-]*:)/i;

/**
 * Whitespace, control characters and backslashes never belong in a link the
 * operator types. Blocking them up front defeats `java\tscript:`-style
 * obfuscation and Windows-path masquerading (`/\evil.test`).
 */
const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f\u007f]/;

/**
 * Normalise a typed link destination, or return `null` when it must be refused.
 *
 * - `https://…`, `http://…` and `mailto:…` are kept as written.
 * - a scheme-less host such as `example.com` becomes `https://example.com`.
 * - a site-relative path (`/stories/x`) or fragment (`#notes`) is kept.
 * - every other scheme (`javascript:`, `data:`, `vbscript:`, `file:`, `blob:`)
 *   and any protocol-relative (`//evil.test`) or backslash path is refused.
 */
export function normalizeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (value === "" || UNSAFE_CHARACTERS.test(value)) {
    return null;
  }

  const scheme = value.match(SCHEME)?.[1];
  if (scheme) {
    return ALLOWED_SCHEME.test(scheme) ? value : null;
  }

  if (value.startsWith("//")) {
    return null;
  }
  if (value.startsWith("#") || value.startsWith("/")) {
    return value;
  }

  return `https://${value}`;
}

/** Convenience predicate for the Tiptap link extension callbacks. */
export function isAllowedLinkHref(raw: string): boolean {
  return normalizeLinkHref(raw) !== null;
}
