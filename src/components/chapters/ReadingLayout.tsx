import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";

/**
 * The reading page frame.
 *
 * Structure, top to bottom: a quiet utility bar, the chapter heading, the
 * prose column, then navigation. Nothing floats over the text, and nothing
 * animates in the reading viewport.
 */
export function ReadingLayout({
  utilityBar,
  breadcrumbs,
  chapterTitle,
  chapterMeta,
  titleAs: Title = "h1",
  children,
  footer,
}: {
  utilityBar?: ReactNode;
  breadcrumbs: Array<{ label: string; href?: string }>;
  chapterTitle: string;
  chapterMeta?: ReactNode;
  /** Heading level for the chapter title. Defaults to `h1` for a real chapter. */
  titleAs?: "h1" | "h2";
  /** The sanitized prose body. */
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="pb-16 sm:pb-24">
      {utilityBar}

      <div className="shell">
        <Breadcrumbs items={breadcrumbs} className="pt-6" />
      </div>

      <header className="reading-column pt-8 sm:pt-12 pb-8 sm:pb-10">
        <Title className="font-display text-display-lg sm:text-display-xl text-ink font-semibold tracking-tight text-balance">
          {chapterTitle}
        </Title>
        {chapterMeta ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-ui text-body-xs sm:text-body-sm text-ink-muted">
            {chapterMeta}
          </div>
        ) : null}
        {/* The rule under the heading is the page's one structural flourish. It
            gives the column a defined top edge without a card or a shadow. */}
        <div aria-hidden="true" className="mt-8 h-0.5 w-16 bg-primary/80 rounded-full" />
      </header>

      {children}

      {footer}
    </article>
  );
}
