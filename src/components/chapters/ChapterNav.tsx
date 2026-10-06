import Link from "next/link";
import { cn } from "@/lib/cn";

export interface ChapterNavData {
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  /** Display position, for "Chapter 3 of 12". */
  currentNumber: number;
  totalCount: number;
  storySlug: string;
  storyTitle: string;
}

/**
 * Chapter navigation.
 *
 * Previous and next are full-width, labelled, and text-forward. Bare arrows
 * save space and tell a screen-reader user nothing.
 *
 * The query layer supplies already-filtered published siblings, so this
 * component never sees a draft (AGENTS.md section 6). Chapter URLs nest under
 * the story: `/stories/[slug]/chapter/[chapterSlug]`.
 */
export function ChapterNav({
  previous,
  next,
  currentNumber,
  totalCount,
  storySlug,
  storyTitle,
}: ChapterNavData) {
  return (
    <nav
      aria-label="Chapter navigation"
      className="mt-(--spacing-section-lg) border-t border-border pt-8"
    >
      <p className="font-ui text-body-xs text-ink-subtle tabular-nums">
        Chapter {currentNumber} of {totalCount}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {previous ? (
          <NavCard
            href={`/stories/${storySlug}/chapter/${previous.slug}`}
            direction="previous"
            title={previous.title}
            storyTitle={storyTitle}
          />
        ) : (
          <span aria-hidden="true" className="hidden sm:block" />
        )}

        {next ? (
          <NavCard
            href={`/stories/${storySlug}/chapter/${next.slug}`}
            direction="next"
            title={next.title}
            storyTitle={storyTitle}
          />
        ) : null}
      </div>

      {next ? (
        <div className="mt-6 sm:hidden">
          <Link
            href={`/stories/${storySlug}/chapter/${next.slug}`}
            className="flex h-11 items-center justify-center rounded-md bg-primary px-5 font-ui text-body-sm font-medium text-on-primary"
          >
            Next chapter
          </Link>
        </div>
      ) : null}
    </nav>
  );
}

function NavCard({
  href,
  direction,
  title,
  storyTitle,
}: {
  href: string;
  direction: "previous" | "next";
  title: string;
  storyTitle: string;
}) {
  const label = direction === "previous" ? "Previous chapter" : "Next chapter";

  return (
    <Link
      href={href}
      rel={direction === "next" ? "next" : "prev"}
      className={cn(
        "group flex flex-col gap-1.5 rounded-md border border-border bg-surface p-4",
        "transition-[border-color,box-shadow] duration-(--duration-base) ease-(--ease-out-quart)",
        "hover:border-border-strong hover:shadow-sm",
        // "Next" aligns right on wide screens, which is the reading convention.
        direction === "next" && "sm:items-end sm:text-right",
      )}
    >
      <span className="flex items-center gap-1.5 font-ui text-body-xs font-medium text-ink-subtle">
        {direction === "previous" ? <Arrow className="size-3" /> : null}
        {label}
        {direction === "next" ? <Arrow className="size-3 rotate-180" /> : null}
      </span>
      <span className="font-display text-heading-xs text-ink text-balance group-hover:text-primary">
        {title}
      </span>
      <span className="sr-only">in {storyTitle}</span>
    </Link>
  );
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 2.5 4 6l3.5 3.5" />
    </svg>
  );
}
