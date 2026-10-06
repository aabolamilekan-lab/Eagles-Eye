import { cn } from "@/lib/cn";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";

/**
 * The single sanctioned renderer for sanitized chapter HTML.
 *
 * Per AGENTS.md section 10, this is the only place in the codebase permitted
 * to use `dangerouslySetInnerHTML`. A new usage anywhere else is a review
 * blocker.
 *
 * Two layers of defence:
 *   1. the sanitizer runs on write, so stored content is already clean
 *   2. the sanitizer runs again here, at render time, which protects rows
 *      written before the write-time rule existed
 *
 * There is no prop to replace the sanitizer. An override would let a caller
 * render stored HTML verbatim, which is exactly the guarantee this component
 * exists to provide, so the allowlist is not negotiable at the call site. A
 * test that needs a specific heading level sets `headingOffset` instead.
 *
 * The `prose` class carries all element styling. It targets elements, never
 * classes, because the sanitizer strips class attributes from stored content.
 */
export function RichText({
  html,
  headingOffset = 1,
  className,
}: {
  /** Stored rich text. It is sanitized again on render, regardless of source. */
  html: string;
  /**
   * Levels to push stored headings down so the page keeps a single `<h1>`.
   * Defaults to `1`: a stored `<h1>` renders as `<h2>`.
   */
  headingOffset?: number;
  className?: string;
}) {
  const safe = sanitizeRichText(html, { headingOffset });

  return (
    <div
      className={cn("prose", className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

/**
 * A typographic ornament between sections.
 *
 * Rendered as a real element with an accessible label, not a CSS background,
 * so it is not announced as an empty image or skipped inconsistently.
 */
export function SectionOrnament({ label = "End of section" }: { label?: string }) {
  return (
    <div className="my-14 flex items-center justify-center gap-3" role="separator">
      <span aria-hidden="true" className="size-1 rounded-full bg-border-strong" />
      <span
        aria-hidden="true"
        className="font-display text-lg tracking-[0.5em] text-ink-subtle"
      >
        * * *
      </span>
      <span aria-hidden="true" className="size-1 rounded-full bg-border-strong" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
