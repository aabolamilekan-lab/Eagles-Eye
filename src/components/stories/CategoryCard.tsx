import Link from "next/link";

/**
 * Category card.
 *
 * A quiet index entry. Categories are navigation, not content, so they get a
 * name and a short description, never an illustration or a volume count. The
 * whole card is clickable through a stretched link on the title — the link wraps
 * only the text, so the heading keeps a real focusable target.
 */
export function CategoryCard({
  category,
}: {
  category: { name: string; slug: string; description: string | null };
}) {
  return (
    <article className="group relative flex flex-col justify-between gap-3 rounded-md border border-border bg-surface p-6 transition-all duration-(--duration-base) ease-(--ease-out-quart) hover:border-border-strong hover:shadow-md hover:-translate-y-0.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h3 className="font-display text-heading-md text-ink transition-colors group-hover:text-primary min-w-0 break-words">
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
          <p className="line-clamp-2 font-ui text-body-sm text-ink-muted text-pretty">
            {category.description}
          </p>
        ) : null}
      </div>

      <div className="pt-2 border-t border-border/50 flex items-center justify-end">
        <span className="font-ui text-body-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Explore &rarr;
        </span>
      </div>
    </article>
  );
}
