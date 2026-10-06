import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Category card.
 *
 * A quiet index entry. Categories are navigation, not content, so they get a
 * count and a name, never an illustration.
 */
export function CategoryCard({
  category,
  storyCount,
}: {
  category: { name: string; slug: string; description: string | null };
  storyCount: number;
}) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      prefetch={false}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-md border border-border bg-surface p-5",
        "transition-[border-color,box-shadow] duration-(--duration-base) ease-(--ease-out-quart)",
        "hover:border-border-strong hover:shadow-sm",
      )}
    >
      <h3 className="font-display text-heading-sm text-ink">
        <span className="after:absolute after:inset-0 after:content-[''] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2">
          {category.name}
        </span>
      </h3>
      {category.description ? (
        <p className="line-clamp-2 font-ui text-body-sm text-ink-muted text-pretty">
          {category.description}
        </p>
      ) : null}
      <p className="mt-2 font-ui text-body-xs text-ink-subtle tabular-nums">
        {storyCount === 1 ? "1 story" : `${storyCount} stories`}
      </p>
    </Link>
  );
}
