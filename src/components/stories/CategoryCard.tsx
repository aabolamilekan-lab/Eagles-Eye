import Link from "next/link";

export interface CategoryCardData {
  name: string;
  slug: string;
  description: string | null;
  storyCount?: number;
}

/**
 * Category card.
 *
 * An editorial topic entry. Categories display a title, short description,
 * accurate published story count, and explore indicator. The entire card is
 * accessible via stretched link.
 */
export function CategoryCard({
  category,
}: {
  category: CategoryCardData;
}) {
  return (
    <article className="group relative flex w-full flex-col justify-between gap-4 rounded-md border border-border/80 bg-surface p-5 sm:p-6 shadow-2xs transition-all duration-(--duration-base) ease-(--ease-out-quart) hover:border-border-strong hover:shadow-md hover:-translate-y-0.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h3 className="font-display text-heading-md text-ink tracking-tight transition-colors group-hover:text-primary min-w-0 break-words">
            <Link
              href={`/categories/${category.slug}`}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {category.name}
            </Link>
          </h3>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4 shrink-0 text-ink-subtle transition-transform duration-300 ease-out group-hover:translate-x-1 group-hover:text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" />
          </svg>
        </div>
        {category.description ? (
          <p className="line-clamp-2 font-ui text-body-sm text-ink-muted text-pretty leading-relaxed">
            {category.description}
          </p>
        ) : null}
      </div>

      <div className="pt-3 border-t border-border/60 flex items-center justify-between font-ui text-body-xs">
        {category.storyCount !== undefined ? (
          <span className="font-medium text-ink-subtle tabular-nums">
            {category.storyCount} {category.storyCount === 1 ? "story" : "stories"}
          </span>
        ) : (
          <span />
        )}
        <span className="font-semibold text-primary inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5">
          Explore &rarr;
        </span>
      </div>
    </article>
  );
}
