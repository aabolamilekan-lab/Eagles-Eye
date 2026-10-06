"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import type {
  AdminStoryListSearch,
  AdminStorySort,
  AdminStoryStatusFilter,
} from "@/lib/validation/story";

const STATUS_OPTIONS: Array<{ value: AdminStoryStatusFilter; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const SORT_OPTIONS: Array<{ value: AdminStorySort; label: string }> = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title (A–Z)" },
  { value: "published", label: "Recently published" },
];

/**
 * Admin story filters.
 *
 * A plain GET form: the state lives in the URL, so a filtered view is
 * shareable, reloadable and works without client state. `page` is deliberately
 * not carried here; applying a filter resets to the first page.
 */
export function StoryFilters({
  search,
  categories,
  hasFilters,
}: {
  search: AdminStoryListSearch;
  categories: Array<{ id: string; name: string; slug: string }>;
  hasFilters: boolean;
}) {
  return (
    <form
      method="get"
      action="/admin/stories"
      className="grid gap-4 rounded-md border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      <TextField
        label="Search"
        name="q"
        type="search"
        defaultValue={search.q}
        placeholder="Title, author or address"
      />
      <SelectField
        label="Status"
        name="status"
        defaultValue={search.status}
        options={STATUS_OPTIONS}
      />
      <SelectField
        label="Category"
        name="category"
        defaultValue={search.category ?? ""}
        options={[
          { value: "", label: "All categories" },
          ...categories.map((category) => ({
            value: category.slug,
            label: category.name,
          })),
        ]}
      />
      <SelectField
        label="Sort"
        name="sort"
        defaultValue={search.sort}
        options={SORT_OPTIONS}
      />

      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" variant="secondary">
          Apply filters
        </Button>
        {hasFilters ? (
          <ButtonLink href="/admin/stories" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </div>
    </form>
  );
}
