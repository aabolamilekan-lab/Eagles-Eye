import { useId, type ReactNode } from "react";
import { Search } from "lucide-react";
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
      action="/search"
      method="get"
      className={cn("flex w-full items-end gap-2", className)}
    >
      {hiddenFields}
      <div className="relative flex-1">
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
          placeholder="Search stories"
          className="h-11 w-full rounded-sm border border-border-strong bg-surface pl-10 pr-3 font-ui text-body-sm text-ink placeholder:text-ink-subtle/70 transition-colors duration-(--duration-fast) hover:border-ink-subtle"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-primary bg-primary px-5 font-ui text-body-sm font-medium text-on-primary transition-colors duration-(--duration-fast) hover:bg-primary-hover hover:border-primary-hover"
      >
        Search
      </button>
    </form>
  );
}
