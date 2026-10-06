import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatPublishedDate } from "@/lib/format";

/**
 * The data a chapter list entry renders.
 *
 * Published chapters only; the reader query layer is responsible for the
 * status filter (AGENTS.md section 6).
 */
export interface ChapterListItem {
  slug: string;
  title: string;
  /** Display position, starting at 1. */
  number: number;
  readingMinutes: number | null;
  /** ISO 8601 publication date, or null when the chapter has none. */
  publishedAt?: string | null;
  isCurrent: boolean;
}

/**
 * Chapter list.
 *
 * A table of contents, not a nav menu. The route nests chapters under the
 * story: `/stories/[slug]/chapter/[chapterSlug]`.
 */
export function ChapterList({
  storySlug,
  chapters,
  className,
}: {
  storySlug: string;
  chapters: ChapterListItem[];
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="font-display text-heading-md text-ink">Chapters</h2>
      <ChapterRows storySlug={storySlug} chapters={chapters} />
    </div>
  );
}

/**
 * The chapter rows, without a heading.
 *
 * Shared by the story's table of contents and the reader's by-index
 * disclosure, so the row markup and current-chapter treatment stay identical.
 */
export function ChapterRows({
  storySlug,
  chapters,
  className,
}: {
  storySlug: string;
  chapters: ChapterListItem[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "mt-4 divide-y divide-(--color-border) border-t border-border",
        className,
      )}
    >
      {chapters.map((chapter) => (
        <li key={chapter.slug}>
          <Link
            href={`/stories/${storySlug}/chapter/${chapter.slug}`}
            aria-current={chapter.isCurrent ? "page" : undefined}
            className={cn(
              "flex items-baseline gap-4 py-4 transition-colors",
              chapter.isCurrent ? "text-ink" : "text-ink hover:text-primary",
            )}
          >
            <span className="w-6 shrink-0 text-right font-ui text-body-xs tabular-nums text-ink-subtle">
              {chapter.number}
            </span>
            <span
              className={cn(
                "flex-1 font-display text-heading-xs text-balance",
                chapter.isCurrent && "font-semibold",
              )}
            >
              {chapter.title}
            </span>
            <ChapterMeta
              readingMinutes={chapter.readingMinutes}
              publishedAt={chapter.publishedAt}
            />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * Trailing per-chapter metadata.
 *
 * Either signal may be absent; the row renders nothing rather than an empty
 * slot. The date is hidden on narrow viewports, where every pixel of the title
 * matters more than the publication date.
 */
function ChapterMeta({
  readingMinutes,
  publishedAt,
}: {
  readingMinutes: number | null;
  publishedAt?: string | null;
}) {
  const published = formatPublishedDate(publishedAt);
  if (!readingMinutes && !published) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-3 font-ui text-body-xs tabular-nums text-ink-subtle">
      {published && publishedAt ? (
        <time dateTime={publishedAt} className="hidden sm:inline">
          {published}
        </time>
      ) : null}
      {readingMinutes ? <span>{readingMinutes} min</span> : null}
    </span>
  );
}
