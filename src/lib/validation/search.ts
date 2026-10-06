import { z } from "zod";
import {
  normalizePage,
  normalizeSlug,
  normalizeSort,
  normalizeTags,
  type StoryListSearchInput,
  type StorySort,
} from "@/lib/validation/story";

/**
 * `/search` query.
 *
 * Search is the catalogue with a stricter free-text contract: the term is
 * normalized to a canonical form before it reaches a query builder, and it is
 * rejected rather than truncated when it is too short or too long. Facets
 * (`category`, `tag`) and `sort` reuse the catalogue's normalizers so both
 * surfaces agree on what a valid slug, tag and order are.
 *
 * `.agent/skills/search/SKILL.md` owns the security, normalization, visibility
 * and empty-state rules applied here. The facet/rank requirements are met with
 * bounded Prisma `contains` predicates (see
 * `src/lib/queries/public/story-filter.ts`) instead of raw full-text SQL,
 * because the task requires category, tag and sort facets backed by safe
 * parameterized queries.
 */

/** A term shorter than this is a typo in progress, not a search. */
export const SEARCH_QUERY_MIN_LENGTH = 2;
/** Hard ceiling; longer input is rejected, never silently cut. */
export const SEARCH_QUERY_MAX_LENGTH = 128;

export type SearchQueryStatus = "empty" | "too_short" | "too_long" | "ok";

export interface NormalizedSearchQuery {
  /**
   * Canonical text. Kept even when the status rejects it so the input can echo
   * exactly what the reader typed without re-normalizing on the client.
   */
  value: string;
  status: SearchQueryStatus;
}

/**
 * Normalize a raw search term to a single canonical line.
 *
 * NFKC folds look-alike Unicode, control and zero-width characters are removed
 * so they cannot pad a term or smuggle separators, and runs of whitespace
 * collapse to one space. The result is safe to hand to `contains` once the
 * caller escapes the LIKE wildcards.
 */
export function normalizeSearchQuery(
  input: string | string[] | undefined,
): NormalizedSearchQuery {
  const raw = Array.isArray(input) ? (input[0] ?? "") : (input ?? "");
  const value = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (value === "") {
    return { value: "", status: "empty" };
  }
  if (value.length > SEARCH_QUERY_MAX_LENGTH) {
    return { value, status: "too_long" };
  }
  if (value.length < SEARCH_QUERY_MIN_LENGTH) {
    return { value, status: "too_short" };
  }
  return { value, status: "ok" };
}

export interface StorySearch {
  /** Runnable term; empty whenever the term is absent or invalid. */
  q: string;
  /** Canonical term for the input, present even when `q` is empty. */
  typedQuery: string;
  queryStatus: SearchQueryStatus;
  category: string | null;
  /** Deduplicated, sorted, valid tag slugs. */
  tags: string[];
  sort: StorySort;
  /** Positive integer as requested; the query layer clamps it to the page count. */
  page: number;
  /** A runnable term or any facet is set, so an empty grid is a real "no results". */
  hasFilters: boolean;
  /** The page should execute a search. */
  runnable: boolean;
}

export interface StorySearchOverrides {
  q?: string;
  category?: string | null;
  tags?: string[];
  sort?: StorySort;
  page?: number;
}

const rawValue = z.union([z.string(), z.array(z.string())]).optional();

const storySearchSchema = z
  .object({
    q: rawValue,
    category: rawValue,
    tag: rawValue,
    sort: rawValue,
    page: rawValue,
  })
  .transform((raw) => ({
    query: normalizeSearchQuery(raw.q),
    category: normalizeSlug(raw.category),
    tags: normalizeTags(raw.tag),
    sort: normalizeSort(raw.sort),
    page: normalizePage(raw.page),
  }));

/**
 * Parse and normalize `/search` search params.
 *
 * Never throws: a malformed URL falls back to the idle default rather than
 * failing the render.
 */
export function parseStorySearch(params: StoryListSearchInput): StorySearch {
  const parsed = storySearchSchema.safeParse(params);
  const { query, category, tags, sort, page } = parsed.success
    ? parsed.data
    : {
        query: { value: "", status: "empty" as SearchQueryStatus },
        category: null,
        tags: [] as string[],
        sort: "recent" as StorySort,
        page: 1,
      };

  const hasFacets = category !== null || tags.length > 0;
  const runnable =
    query.status === "ok" || (query.status === "empty" && hasFacets);

  return {
    q: query.status === "ok" ? query.value : "",
    typedQuery: query.value,
    queryStatus: query.status,
    category,
    tags,
    sort,
    page,
    hasFilters: query.status === "ok" || hasFacets,
    runnable,
  };
}

/**
 * Build a `/search` URL from the current search with optional overrides.
 *
 * Page resets to 1 unless explicitly overridden, so changing a filter never
 * strands the reader on an out-of-range page.
 */
export function searchHref(
  base: StorySearch,
  overrides: StorySearchOverrides = {},
): string {
  const q = (overrides.q ?? base.q).trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
  const category =
    overrides.category === undefined ? base.category : overrides.category;
  const tags = overrides.tags ?? base.tags;
  const sort = overrides.sort ?? base.sort;
  const page = overrides.page ?? 1;

  const search = new URLSearchParams();
  if (q) {
    search.set("q", q);
  }
  if (category) {
    search.set("category", category);
  }
  for (const tag of tags) {
    search.append("tag", tag);
  }
  if (sort !== "recent") {
    search.set("sort", sort);
  }
  if (page > 1) {
    search.set("page", String(page));
  }

  const query = search.toString();
  return query ? `/search?${query}` : "/search";
}
