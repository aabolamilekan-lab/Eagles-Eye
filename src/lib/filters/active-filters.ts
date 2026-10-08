import type { CategorySummary } from "@/lib/queries/public/categories";
import type { TagOption } from "@/lib/queries/public/tags";

export interface ActiveFilter {
  key: string;
  label: string;
  href: string;
}

/** The facet state the catalogue listing and the search page both share. */
export interface FacetState {
  q: string;
  category: string | null;
  tags: string[];
}

/**
 * Chips describing every filter currently applied, each linking to the same
 * view with just that one filter removed.
 *
 * Shared by `/stories` and `/search` so the two surfaces cannot drift. The
 * caller supplies its own href builder because the two pages keep state in
 * different routes.
 */
export function buildActiveFilters(
  search: FacetState,
  categories: CategorySummary[],
  tags: TagOption[],
  hrefFor: (changes: {
    q?: string;
    category?: string | null;
    tags?: string[];
  }) => string,
): ActiveFilter[] {
  const active: ActiveFilter[] = [];

  if (search.q) {
    active.push({
      key: "q",
      label: `“${search.q}”`,
      href: hrefFor({ q: "" }),
    });
  }

  if (search.category) {
    const name =
      categories.find((category) => category.slug === search.category)?.name ??
      search.category;
    active.push({
      key: "category",
      label: name,
      href: hrefFor({ category: null }),
    });
  }

  for (const slug of search.tags) {
    const name = tags.find((tag) => tag.slug === slug)?.name ?? slug;
    active.push({
      key: `tag-${slug}`,
      label: name,
      href: hrefFor({ tags: search.tags.filter((tag) => tag !== slug) }),
    });
  }

  return active;
}
