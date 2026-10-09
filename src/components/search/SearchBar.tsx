import { useId, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Search field.
 *
 * A plain HTML GET form. It submits `?q=...` to `/search`, so it works with
 * JavaScript disabled and the query is shareable and crawlable — no client
 * state stands between the reader and the URL.
 *
 * The field is a real labelled control; `defaultValue` reflects the current
 * query so a submitted search stays in the box. `hiddenFields` lets a caller
 * preserve surrounding state (category, tags, sort) when the query is
 * re-submitted from a page that has facets.
 *
 * The form carries an accessible name so it is distinguishable from any other
 * search landmark on the page. The kbd chip advertises the `/` shortcut bound
 * by `KeyboardShortcuts`.
 */
export function SearchBar({
  query = "",
  maxLength = 100,
  hiddenFields,
  className,
}: {
  query?: string;
  /** Hard input ceiling; the server enforces its own contract. */
  maxLength?: number;
  /** Extra `input type="hidden"` fields submitted alongside `q`. */
  hiddenFields?: ReactNode;
  className?: string;
}) {
  const generated = useId();
  const id = `site-search-${generated}`;

  return (
    <form
      role="search"
      aria-label="Site search"
      action="/search"
      method="get"
      className={cn("flex w-full items-end gap-2", className)}
    >
      {hiddenFields}
      <div className="relative flex-1 min-w-0">
        <label htmlFor={id} className="sr-only">
          Search stories
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
        />
        <input
          id={id}
          type="search"
          name="q"
          defaultValue={query}
          maxLength={maxLength}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Search stories..."
          aria-describedby={`${id}-hint`}
          className="h-11 w-full rounded-md border border-border-strong bg-surface pl-10 pr-4 sm:pr-16 font-ui text-body-sm text-ink transition-all duration-(--duration-fast) placeholder:text-ink-subtle hover:border-ink-subtle focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-border bg-surface-sunken px-2 py-0.5 font-ui text-[11px] font-medium text-ink-subtle shadow-2xs sm:inline-block"
        >
          /
        </kbd>
      </div>
      <Button type="submit" variant="primary" className="shrink-0">
        Search
      </Button>
      <span id={`${id}-hint`} className="sr-only">
        Press the slash key to focus this field.
      </span>
    </form>
  );
}
