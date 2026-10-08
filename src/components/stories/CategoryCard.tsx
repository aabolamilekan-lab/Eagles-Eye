import Link from "next/link";

/**
 * Category card.
 *
 * A quiet index entry. Categories are navigation, not content, so they get a
 * count and a name, never an illustration. The whole card is clickable through
 * a stretched link on the title — the link wraps only the text, so the heading
 * keeps a real focusable target.
 */
export function CategoryCard({
  category,
  storyCount,
}: {
  category: { name: string; slug: string; description: string | null };
  storyCount: number;
}) {
  return (
    <article className="group relative flex flex-col justify-between gap-3 rounded-md border border-border bg-surface p-6 transition-all duration-(--duration-base) ease-(--ease-out-quart) hover:border-border-strong hover:shadow-md hover:-translate-y-0.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-heading-md text-ink transition-colors group-hover:text-primary">
            <Link
              href={`/categories/${category.slug}`}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {category.name}
            </Link>
          </h3>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4 text-ink-subtle transition-transform duration-300 ease-out group-hover:translate-x-1 group-hover:text-primary"
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
          <p className="line-clamp-2 font-ui text-body-sm text-ink-muted text-pretty">
            {category.description}
          </p>
        ) : null}
      </div>

      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
        <span className="font-ui text-body-xs font-medium text-ink-subtle tabular-nums">
          {storyCount === 1 ? "1 story" : `${storyCount} stories`}
        </span>
        <span className="font-ui text-body-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Explore &rarr;
        </span>
      </div>
    </article>
  );
}
