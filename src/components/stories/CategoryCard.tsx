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
    <article className="group relative flex w-full flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-surface p-4 sm:p-6 shadow-2xs transition-all duration-(--duration-base) ease-(--ease-out-quart) hover:border-border-strong hover:shadow-md hover:-translate-y-0.5 focus-within:border-[#FFE500] focus-within:ring-2 focus-within:ring-[#FFE500]/40">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h3 className="font-sans text-heading-md font-bold text-ink tracking-tight transition-colors group-hover:text-black group-hover:underline min-w-0 break-words">
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
            className="size-4 shrink-0 text-ink-subtle transition-transform duration-300 ease-out group-hover:translate-x-1 group-hover:text-black"
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

      <div className="pt-3 border-t border-border/60 flex items-center justify-end font-ui text-body-xs">
        <span className="font-bold text-ink inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5 group-hover:text-black">
          Explore &rarr;
        </span>
      </div>
    </article>
  );
}
