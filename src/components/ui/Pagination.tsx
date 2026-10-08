import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Total items, so the visible range can be stated in words. */
  totalItems: number;
  pageSize: number;
  /** Returns the href for a page number, preserving filters. */
  buildHref: (target: number) => string;
  /** Noun for the result, e.g. "stories". Used in the summary line. */
  itemNoun?: string;
  /** Plurals the noun. Defaults to `itemNoun + "s"`. */
  itemNounPlural?: string;
  className?: string;
}

/**
 * Pagination as real links.
 *
 * Page numbers are anchors so they are crawlable, shareable and middle-click
 * -able. Driven by the query layer's page and total, never by slicing an
 * already-rendered list.
 *
 * Controls meet the 44px target minimum. A single-page result set still shows
 * the "Showing 1–n of n" line so the reader knows the list is complete rather
 * than truncated — but it renders no navigation landmark and no controls.
 */
export function Pagination({
  page,
  pageCount,
  totalItems,
  pageSize,
  buildHref,
  itemNoun = "result",
  itemNounPlural,
  className,
}: PaginationProps) {
  const plural = itemNounPlural ?? `${itemNoun}s`;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  // Nothing at all: callers render an empty state instead of a range line.
  if (totalItems === 0) return null;

  const summary = (
    <p className="font-ui text-body-xs text-ink-muted">
      Showing <span className="tabular-nums">{first}</span>–
      <span className="tabular-nums">{last}</span> of{" "}
      <span className="tabular-nums">{totalItems}</span>{" "}
      {totalItems === 1 ? itemNoun : plural}
    </p>
  );

  if (pageCount <= 1) {
    return (
      <div
        className={cn(
          "flex items-center border-t border-border pt-6",
          className,
        )}
      >
        {summary}
      </div>
    );
  }

  const pages = pageWindow(page, pageCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col items-center justify-between gap-4 border-t border-border pt-6",
        "sm:flex-row",
        className,
      )}
    >
      {summary}

      <div className="flex items-center gap-1">
        <PageLink
          href={buildHref(page - 1)}
          disabled={page === 1}
          rel="prev"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </PageLink>

        {pages.map((entry, index) =>
          entry === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1.5 font-ui text-body-sm text-ink-subtle"
            >
              …
            </span>
          ) : (
            <Link
              key={entry}
              href={buildHref(entry)}
              aria-current={entry === page ? "page" : undefined}
              aria-label={`Page ${entry}`}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2",
                "font-ui text-body-sm tabular-nums transition-colors",
                entry === page
                  ? "bg-primary text-on-primary"
                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
            >
              {entry}
            </Link>
          ),
        )}

        <PageLink
          href={buildHref(page + 1)}
          disabled={page === pageCount}
          rel="next"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: "prev" | "next";
  children: ReactNode;
}) {
  const base =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md font-ui text-body-sm transition-colors";

  if (disabled) {
    const reason =
      rel === "prev" ? "No previous page" : "No next page";
    return (
      <span
        aria-disabled="true"
        // Hover tooltip for pointer users; the sr-only span is what screen
        // readers actually hear, since most do not announce `title`.
        title={reason}
        className={cn(base, "cursor-not-allowed text-ink-subtle/60")}
      >
        {children}
        <span className="sr-only">{reason}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      rel={rel}
      aria-label={rel === "prev" ? "Previous page" : "Next page"}
      className={cn(base, "text-ink-muted hover:bg-surface-sunken hover:text-ink")}
    >
      {children}
    </Link>
  );
}

/** First, last, and a window around the current page. Gaps become "gap". */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages: Array<number | "gap"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);

  if (start > 2) pages.push("gap");
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < pageCount - 1) pages.push("gap");

  pages.push(pageCount);
  return pages;
}
