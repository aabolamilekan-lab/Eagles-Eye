import { z } from "zod";
import { COVER_KEY_PATTERN } from "@/lib/storage/cover-key";

/**
 * `/stories` listing query.
 *
 * The reader-facing catalogue is addressable: `q`, `category`, `tag`, `sort` and
 * `page` are the whole state, so a filtered view is shareable, crawlable and
 * works without JavaScript. Every value is untrusted and is normalized here
 * before it reaches a query builder. Zod strips unknown keys, and the stricter
 * slug/whitelist ceilings stop a crafted URL from widening a scan.
 */

export const STORY_SORTS = ["recent", "oldest", "popular", "title"] as const;
export type StorySort = (typeof STORY_SORTS)[number];

/** One page of the public catalogue. Hard cap lives with the query layer. */
export const STORY_PAGE_SIZE = 12;
export const STORY_MAX_TAGS = 8;
export const STORY_QUERY_MAX_LENGTH = 100;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;

export interface StoryListSearch {
  /** Normalized free-text query; empty when absent. */
  q: string;
  /** Validated category slug, or null. */
  category: string | null;
  /** Deduplicated, sorted, valid tag slugs. */
  tags: string[];
  sort: StorySort;
  /** Positive integer as requested; the query layer clamps it to the page count. */
  page: number;
  /** True when any filter is set, so the page can pick the right empty state. */
  hasFilters: boolean;
}

export interface StoryListOverrides {
  q?: string;
  category?: string | null;
  tags?: string[];
  sort?: StorySort;
  page?: number;
}

/** Next.js `searchParams`, as received on the server. */
export interface StoryListSearchInput {
  readonly [key: string]: string | string[] | undefined;
}

type RawValue = string | string[] | undefined;

function firstValue(value: RawValue): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeQuery(value: RawValue): string {
  return firstValue(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, STORY_QUERY_MAX_LENGTH);
}

export function normalizeSlug(value: RawValue): string | null {
  const slug = firstValue(value).trim().toLowerCase();
  if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    return null;
  }
  return slug;
}

export function normalizeTags(value: RawValue): string[] {
  const source = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const entry of source) {
    const slug = entry.trim().toLowerCase();
    if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
      continue;
    }
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    tags.push(slug);
    if (tags.length >= STORY_MAX_TAGS) {
      break;
    }
  }

  // Sorted so the same selection always produces the same cache key and URL.
  return tags.sort();
}

export function normalizeSort(value: RawValue): StorySort {
  const raw = firstValue(value);
  return (STORY_SORTS as readonly string[]).includes(raw)
    ? (raw as StorySort)
    : "recent";
}

export function normalizePage(value: RawValue): number {
  const parsed = Number.parseInt(firstValue(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

const rawValue = z.union([z.string(), z.array(z.string())]).optional();

const storyListSearchSchema = z
  .object({
    q: rawValue,
    category: rawValue,
    tag: rawValue,
    sort: rawValue,
    page: rawValue,
  })
  .transform((raw) => ({
    q: normalizeQuery(raw.q),
    category: normalizeSlug(raw.category),
    tags: normalizeTags(raw.tag),
    sort: normalizeSort(raw.sort),
    page: normalizePage(raw.page),
  }));

/**
 * Parse and normalize `/stories` search params.
 *
 * Never throws: a malformed URL falls back to the unfiltered default rather
 * than failing the render.
 */
export function parseStoryListSearch(
  params: StoryListSearchInput,
): StoryListSearch {
  const parsed = storyListSearchSchema.safeParse(params);
  const base = parsed.success
    ? parsed.data
    : {
        q: "",
        category: null,
        tags: [],
        sort: "recent" as StorySort,
        page: 1,
      };

  return {
    ...base,
    hasFilters:
      base.q !== "" || base.category !== null || base.tags.length > 0,
  };
}

/**
 * Validate a single public content slug from a route segment.
 *
 * Returns the normalized slug, or null when it cannot be a real slug. A caller
 * turns null into `notFound()` before the slug reaches the database.
 */
export function parseContentSlug(value: string): string | null {
  return normalizeSlug(value);
}

/** Clamp a requested page into `[1, pageCount]`. */
export function clampPage(page: number, pageCount: number): number {
  const max = Math.max(1, Math.floor(pageCount));
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.min(Math.floor(page), max);
}

/**
 * Build a `/stories` URL from the current search with optional overrides.
 *
 * Page resets to 1 unless explicitly overridden, so changing a filter never
 * strands the reader on an out-of-range page.
 */
export function storyListHref(
  base: StoryListSearch,
  overrides: StoryListOverrides = {},
): string {
  const q = (overrides.q ?? base.q).trim();
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
  return query ? `/stories?${query}` : "/stories";
}

/* ------------------------------------------------------------------------- */
/* Admin story management                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Zod schemas for the admin story surfaces.
 *
 * Both create and update are `.strict()`, so unknown keys never reach Prisma,
 * and the input type is always `z.infer`, never a hand-written duplicate.
 * Status and `featured` are deliberately absent: the action derives those from
 * the stored row and the transition table, never from the form.
 * .agent/skills/story-management/SKILL.md.
 */
export const STORY_TITLE_MAX = 200;
export const STORY_AUTHOR_MAX = 200;
export const STORY_SHORT_DESCRIPTION_MAX = 300;
export const STORY_DESCRIPTION_MAX = 100_000;
export const STORY_COVER_MAX = 2048;
export const STORY_MAX_TAG_COUNT = 20;
export const ADMIN_STORY_PAGE_SIZE = 20;

/**
 * A cover is always a key produced by the upload route.
 *
 * External `https://` URLs are deliberately not accepted. An admin-supplied
 * remote URL cannot be validated here, would have to be allowlisted in
 * `next/image` to render at all, and that allowlist turns the image optimizer
 * into an open proxy — a fetch primitive pointed at any hostname the admin
 * names, including internal ones. Rejecting the value keeps every cover inside
 * storage this application owns, and keeps `coverUrl()` total: the key shape it
 * accepts is exactly the shape it can serve.
 *
 * The key pattern is shared with the storage layer, so a value that could not
 * be served is rejected before it reaches Prisma. Never a `javascript:` payload.
 */
function normalizeCoverImage(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  return raw === "" ? null : raw;
}

function isValidCoverImage(value: string): boolean {
  if (value.length > STORY_COVER_MAX || value.includes("..")) {
    return false;
  }
  return COVER_KEY_PATTERN.test(value);
}

const coverImageField = z
  .string()
  .max(STORY_COVER_MAX)
  .optional()
  .transform(normalizeCoverImage)
  .refine((value) => value === null || isValidCoverImage(value), {
    message: "Upload a cover image.",
  });

const categoryIdField = z
  .string()
  .max(64)
  .optional()
  .transform((value) => {
    const raw = (value ?? "").trim();
    return raw === "" ? null : raw;
  });

const tagIdsField = z
  .array(z.string().trim().min(1).max(64))
  .max(STORY_MAX_TAG_COUNT)
  .optional()
  .transform((value) => Array.from(new Set(value ?? [])));

export const createStorySchema = z
  .object({
    title: z.string().trim().min(1, "A title is required.").max(STORY_TITLE_MAX),
    slug: z.string().trim().max(MAX_SLUG_LENGTH).optional(),
    author: z.string().trim().max(STORY_AUTHOR_MAX).optional(),
    shortDescription: z
      .string()
      .trim()
      .max(STORY_SHORT_DESCRIPTION_MAX)
      .optional(),
    description: z.string().max(STORY_DESCRIPTION_MAX).optional(),
    coverImage: coverImageField,
    categoryId: categoryIdField,
    tagIds: tagIdsField,
  })
  .strict();

export type CreateStoryInput = z.infer<typeof createStorySchema>;

export const updateStorySchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1, "A title is required.").max(STORY_TITLE_MAX),
    slug: z.string().trim().max(MAX_SLUG_LENGTH).optional(),
    author: z.string().trim().max(STORY_AUTHOR_MAX).optional(),
    shortDescription: z
      .string()
      .trim()
      .max(STORY_SHORT_DESCRIPTION_MAX)
      .optional(),
    description: z.string().max(STORY_DESCRIPTION_MAX).optional(),
    coverImage: coverImageField,
    categoryId: categoryIdField,
    tagIds: tagIdsField,
    /** Required only when a published story's slug actually changes. */
    confirmSlugChange: z.boolean().optional().default(false),
  })
  .strict();

export type UpdateStoryInput = z.infer<typeof updateStorySchema>;

export const ADMIN_STORY_SORTS = [
  "updated",
  "created",
  "title",
  "published",
] as const;
export type AdminStorySort = (typeof ADMIN_STORY_SORTS)[number];

export const ADMIN_STORY_STATUSES = [
  "ALL",
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type AdminStoryStatusFilter = (typeof ADMIN_STORY_STATUSES)[number];

export interface AdminStoryListSearch {
  q: string;
  status: AdminStoryStatusFilter;
  category: string | null;
  sort: AdminStorySort;
  page: number;
}

function normalizeAdminStatus(value: RawValue): AdminStoryStatusFilter {
  const raw = firstValue(value);
  return (ADMIN_STORY_STATUSES as readonly string[]).includes(raw)
    ? (raw as AdminStoryStatusFilter)
    : "ALL";
}

function normalizeAdminSort(value: RawValue): AdminStorySort {
  const raw = firstValue(value);
  return (ADMIN_STORY_SORTS as readonly string[]).includes(raw)
    ? (raw as AdminStorySort)
    : "updated";
}

const adminStoryListSchema = z
  .object({
    q: rawValue,
    status: rawValue,
    category: rawValue,
    sort: rawValue,
    page: rawValue,
  })
  .transform((raw) => ({
    q: normalizeQuery(raw.q),
    status: normalizeAdminStatus(raw.status),
    category: normalizeSlug(raw.category),
    sort: normalizeAdminSort(raw.sort),
    page: normalizePage(raw.page),
  }));

/** Parse `/admin/stories` search params, falling back to the default view. */
export function parseAdminStoryListSearch(
  params: StoryListSearchInput,
): AdminStoryListSearch {
  const parsed = adminStoryListSchema.safeParse(params);
  return parsed.success
    ? parsed.data
    : { q: "", status: "ALL", category: null, sort: "updated", page: 1 };
}

/** Build a `/admin/stories` URL from the current search with overrides. */
export function adminStoryListHref(
  base: AdminStoryListSearch,
  overrides: Partial<AdminStoryListSearch> = {},
): string {
  const next = { ...base, ...overrides };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.status !== "ALL") search.set("status", next.status);
  if (next.category) search.set("category", next.category);
  if (next.sort !== "updated") search.set("sort", next.sort);
  if (next.page > 1) search.set("page", String(next.page));

  const query = search.toString();
  return query ? `/admin/stories?${query}` : "/admin/stories";
}
