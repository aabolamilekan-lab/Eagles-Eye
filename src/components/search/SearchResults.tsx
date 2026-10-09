import { StoryCard } from "@/components/stories/StoryCard";
import { Pagination } from "@/components/ui/Pagination";
import { searchHref, type StorySearch } from "@/lib/validation/search";
import type { StorySearchResult } from "@/lib/queries/public/search";

/**
 * Search results.
 *
 * A heading naming the search, then the matching stories as row cards, then
 * pagination. Row layout keeps the result list scannable; the heading is an
 * `<h2>` so the page still has a clear outline under its `h1`. Result volume is
 * never stated publicly.
 */
export function SearchResults({
  search,
  result,
}: {
  search: StorySearch;
  result: StorySearchResult;
}) {
  const { stories, total, page, pageCount, pageSize } = result;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <h2 className="font-display text-heading-md text-ink">
          {search.q ? (
            <>
              Results for <span className="italic text-primary">“{search.q}”</span>
            </>
          ) : (
            "Filtered Stories"
          )}
        </h2>
        <span className="font-ui text-body-xs font-medium text-ink-muted bg-surface-sunken px-2.5 py-1 rounded-full border border-border">
          {total} {total === 1 ? "story" : "stories"}
        </span>
      </div>

      <ul className="flex list-none flex-col divide-y divide-border/60">
        {stories.map((story) => (
          <li key={story.slug} className="py-6 first:pt-0 last:pb-0">
            <StoryCard story={story} layout="row" />
          </li>
        ))}
      </ul>

      <Pagination
        className="mt-8 pt-4 border-t border-border/60"
        page={page}
        pageCount={pageCount}
        totalItems={total}
        pageSize={pageSize}
        buildHref={(target) => searchHref(search, { page: target })}
        itemNoun="result"
        showSummary={false}
      />
    </div>
  );
}
