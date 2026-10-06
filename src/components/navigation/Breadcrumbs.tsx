import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumbs as an ordered list.
 *
 * The final crumb is the current page: not a link, marked aria-current. The
 * nav carries the name so screen-reader users can skip it.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="font-ui text-body-xs text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "font-ui text-body-xs",
                    isLast ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {item.label}
                </span>
              )}
              {isLast ? null : (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3 shrink-0 text-ink-subtle"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
