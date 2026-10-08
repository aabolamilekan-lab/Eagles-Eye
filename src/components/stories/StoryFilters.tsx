import { Button, ButtonLink } from "@/components/ui/Button";
import { CheckboxField, SelectField, TextField } from "@/components/ui/Field";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import { storyListHref, type StoryListSearch } from "@/lib/validation/story";
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
 * Catalogue filters.
 *
 * A plain HTML GET form, so filtering works without JavaScript and the whole
 * state lives in the URL. Submitting drops `page`, which resets the result to
 * page one; the pager preserves every filter.
 */
export function StoryFilters({
  search,
  categories,
  tags,
}: {
  search: StoryListSearch;
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
    (changes) => storyListHref(search, changes),
  );

  return (
    <section aria-labelledby="story-filters-heading" className="mt-10">
      <h2 id="story-filters-heading" className="sr-only">
        Filter stories
      </h2>

      <form
        role="search"
        action="/stories"
        method="get"
        aria-label="Filter and search stories"
        className="rounded-md border border-border bg-surface p-4 sm:p-5"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <TextField
            label="Search"
            name="q"
            type="search"
            defaultValue={search.q}
            maxLength={100}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Title, author or description"
          />

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
          <details className="mt-4 border-t border-border pt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-body-sm font-medium text-ink">
              Filter by tag
              {search.tags.length > 0 ? (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 font-ui text-body-xs text-on-primary tabular-nums">
                  {search.tags.length} selected
                </span>
              ) : null}
            </summary>

            <fieldset className="mt-3">
              <legend className="sr-only">Filter by tag</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
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
          </details>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" size="sm">
            Apply filters
          </Button>
          {search.hasFilters ? (
            <ButtonLink href="/stories" variant="ghost" size="sm">
              Clear all
            </ButtonLink>
          ) : null}
        </div>
      </form>

      <ActiveFilterChips active={active} />
    </section>
  );
}
