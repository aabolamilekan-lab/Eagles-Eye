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
    <div>
      <h2 className="font-display text-heading-sm text-ink">
        {search.q ? `Results for “${search.q}”` : "Results"}
      </h2>

      <ul className="mt-6 flex list-none flex-col divide-y divide-border">
        {stories.map((story) => (
          <li key={story.slug} className="py-5 first:pt-0 last:pb-0">
            <StoryCard story={story} layout="row" />
          </li>
        ))}
      </ul>

      <Pagination
        className="mt-8"
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
