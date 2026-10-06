import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchFilters } from "@/components/search/SearchFilters";
import { SearchResults } from "@/components/search/SearchResults";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPublishedCategoryOptions } from "@/lib/queries/public/categories";
import { getPublishedTagOptions } from "@/lib/queries/public/tags";
import { searchPublishedStories } from "@/lib/queries/public/search";
import {
  parseStorySearch,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  type StorySearch,
} from "@/lib/validation/search";
import { clientIpFromHeaders } from "@/lib/rate-limit/sliding-window";
import { getSearchLimiter } from "@/lib/rate-limit/search";
import { logger } from "@/lib/logger";

/**
 * Public search page.
 *
 * All search state lives in the URL (`q`, `category`, `tag`, `sort`, `page`),
 * is normalized server-side, and is executed by the shared public query layer,
 * so only published stories with a published chapter can ever appear. The page
 * chooses one of a small set of states: idle, term too short/long, rate-limited,
 * no results, or results. The term is never logged.
 */

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const search = parseStorySearch(await searchParams);
  const title = search.typedQuery ? `Search: ${search.typedQuery}` : "Search";

  return {
    title,
    description:
      "Search published stories on Eagles Eye by title, author, category, tag, or keyword.",
    alternates: { canonical: "/search" },
    // A result page indexed under its query string would expose thin, duplicated
    // pages. The static entry point stays reachable via the header.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const search = parseStorySearch(await searchParams);

  if (!search.runnable) {
    return (
      <SearchLayout search={search}>
        {renderIdleState(search)}
      </SearchLayout>
    );
  }

  const requestHeaders = await headers();
  const decision = getSearchLimiter().check(clientIpFromHeaders(requestHeaders));

  if (!decision.allowed) {
    logger.warn("search.rate_limited", {
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return (
      <SearchLayout search={search}>
        <EmptyState
          title="Too many searches"
          description="You have made a lot of searches in a short time. Please wait a moment, then try again."
          action={
            <ButtonLink href="/stories" variant="secondary">
              Browse all stories
            </ButtonLink>
          }
        />
      </SearchLayout>
    );
  }

  const [categories, tags, result] = await Promise.all([
    getPublishedCategoryOptions(),
    getPublishedTagOptions(),
    searchPublishedStories({
      q: search.q,
      category: search.category,
      tags: search.tags,
      sort: search.sort,
      page: search.page,
    }),
  ]);

  logger.info("search.executed", {
    results: result.total,
    page: result.page,
    hasCategory: search.category !== null,
    tagCount: search.tags.length,
    termLength: search.q.length,
  });

  return (
    <SearchLayout
      search={search}
      filters={
        <SearchFilters search={search} categories={categories} tags={tags} />
      }
    >
      {result.total === 0 ? (
        <EmptyState
          title={
            search.q
              ? `No results for “${search.q}”`
              : "No stories match these filters"
          }
          description={noResultsDescription(search)}
          action={
            <ButtonLink href="/stories" variant="secondary">
              Browse all stories
            </ButtonLink>
          }
          secondaryAction={
            search.hasFilters ? (
              <ButtonLink href="/search" variant="ghost">
                Clear search
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <SearchResults search={search} result={result} />
      )}
    </SearchLayout>
  );
}

function SearchLayout({
  search,
  filters,
  children,
}: {
  search: StorySearch;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="shell py-(--spacing-section)">
      <header className="max-w-2xl">
        <p className="label-micro text-primary">Search</p>
        <h1 className="mt-3 font-display text-display-lg text-ink text-balance">
          Search stories
        </h1>
        <p className="mt-4 font-ui text-body text-ink-muted text-pretty">
          Find a story by title, author, category, tag, or keyword. Results are
          drawn from published stories only.
        </p>
      </header>

      <div className="mt-8 max-w-2xl">
        <SearchBar
          query={search.typedQuery}
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          hiddenFields={<SearchPreservedFields search={search} />}
        />
      </div>

      {filters}

      <div className="mt-10">{children}</div>
    </div>
  );
}

/**
 * Carry the facets through a query-bar submission. The term is submitted by the
 * field itself, so it is deliberately not duplicated here.
 */
function SearchPreservedFields({ search }: { search: StorySearch }) {
  return (
    <>
      {search.category ? (
        <input type="hidden" name="category" value={search.category} />
      ) : null}
      {search.tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}
      {search.sort !== "recent" ? (
        <input type="hidden" name="sort" value={search.sort} />
      ) : null}
    </>
  );
}

function renderIdleState(search: StorySearch): ReactNode {
  if (search.queryStatus === "too_short") {
    return (
      <EmptyState
        title="Keep typing"
        description={`Add a little more — search terms need at least ${SEARCH_QUERY_MIN_LENGTH} characters.`}
        action={
          <ButtonLink href="/stories" variant="secondary">
            Browse all stories
          </ButtonLink>
        }
      />
    );
  }

  if (search.queryStatus === "too_long") {
    return (
      <EmptyState
        title="That search is too long"
        description={`Search terms can be up to ${SEARCH_QUERY_MAX_LENGTH} characters. Shorten it and try again.`}
        action={
          <ButtonLink href="/stories" variant="secondary">
            Browse all stories
          </ButtonLink>
        }
      />
    );
  }

  return (
    <EmptyState
      title="Search the catalogue"
      description={`Type at least ${SEARCH_QUERY_MIN_LENGTH} characters to search by title, author, category, tag, or keyword.`}
      action={
        <ButtonLink href="/stories" variant="secondary">
          Browse all stories
        </ButtonLink>
      }
    />
  );
}

function noResultsDescription(search: StorySearch): string {
  if (search.q && search.hasFilters) {
    return "Try a different term, or loosen the filters to widen the search.";
  }
  if (search.q) {
    return "Search runs against published stories. Try a different spelling or a broader term.";
  }
  return "No published stories match the selected category and tags.";
}
