import { SlidersHorizontal } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CheckboxField, SelectField } from "@/components/ui/Field";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import { searchHref, type StorySearch } from "@/lib/validation/search";
import { buildActiveFilters } from "@/lib/filters/active-filters";
import type { CategorySummary } from "@/lib/queries/public/categories";
import type { TagOption } from "@/lib/queries/public/tags";

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "popular", label: "Most read" },
  { value: "title", label: "Title A–Z" },
];

/**
 * Search facets.
 *
 * A plain HTML GET form, so filtering works without JavaScript and the whole
 * state lives in the URL. On mobile the facets collapse behind a `<details>`
 * disclosure with no JavaScript; on desktop the disclosure is forced open so
 * the controls are always visible. The term is carried as a hidden field so
 * applying a facet never drops the query.
 */
export function SearchFilters({
  search,
  categories,
  tags,
}: {
  search: StorySearch;
  categories: CategorySummary[];
  tags: TagOption[];
}) {
  const categoryOptions = [
    { value: "", label: "All categories" },
    ...categories.map((category) => ({
      value: category.slug,
      label: category.name,
    })),
  ];

  const active = buildActiveFilters(
    search,
    categories,
    tags,
    (changes) => searchHref(search, changes),
  );

  return (
    <section aria-labelledby="search-filters-heading" className="mt-6">
      <h2 id="search-filters-heading" className="sr-only">
        Filter search results
      </h2>

      <form
        role="search"
        action="/search"
        method="get"
        aria-label="Filter search results"
      >
        {/* The term survives facet changes; the query bar carries the reverse. */}
        <input type="hidden" name="q" value={search.q} />

        <details className="rounded-md border border-border bg-surface md:[&::details-content]:[content-visibility:visible]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 font-ui text-body-sm font-medium text-ink [&::-webkit-details-marker]:hidden md:hidden">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal
                aria-hidden="true"
                className="size-4 text-ink-muted"
              />
              Filters
            </span>
            <span className="font-ui text-body-xs font-normal text-ink-subtle">
              {active.length > 0 ? `${active.length} active` : "Category, tags, sort"}
            </span>
          </summary>

          {/*
            A closed `<details>` hides its non-summary children: the user-agent
            rule sets `display: none`, which the authored `md:block` below
            overrides, and newer engines additionally hide the subtree through
            `content-visibility: hidden` on `::details-content`, which no child
            rule can reach. The variant on the `<details>` re-enables that
            pseudo-element at `md` and up, so the same markup is an accordion on
            mobile and a static panel on desktop.
          */}
          <div className="space-y-4 border-t border-border p-4 md:block md:border-t-0 md:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
              <SelectField
                label="Category"
                name="category"
                defaultValue={search.category ?? ""}
                options={categoryOptions}
              />

              <SelectField
                label="Sort"
                name="sort"
                defaultValue={search.sort}
                options={SORT_OPTIONS}
              />
            </div>

            {tags.length > 0 ? (
              <fieldset className="border-t border-border pt-4">
                <legend className="font-ui text-body-sm font-medium text-ink">
                  Tags
                </legend>
                <p className="mt-1 font-ui text-body-xs text-ink-muted">
                  Selecting more than one tag shows stories that match all of
                  them.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                  {tags.map((tag) => (
                    <CheckboxField
                      key={tag.slug}
                      name="tag"
                      value={tag.slug}
                      label={tag.name}
                      defaultChecked={search.tags.includes(tag.slug)}
                    />
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="submit" variant="primary" size="sm">
                Apply filters
              </Button>
              {search.hasFilters ? (
                <ButtonLink href="/search" variant="ghost" size="sm">
                  Clear all
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </details>
      </form>

      <ActiveFilterChips active={active} />
    </section>
  );
}
