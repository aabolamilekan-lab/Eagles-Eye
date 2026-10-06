import { z } from "zod";
import type { StorySort } from "@/lib/validation/story";

/**
 * Zod schemas for category and tag management.
 *
 * Both create and update are `.strict()`, so unknown keys never reach Prisma,
 * and the input type is always `z.infer`, never a hand-written duplicate. The
 * slug is optional: the action derives one from the name when it is blank, so a
 * slug is never trusted from the form. Names are trimmed and length-capped;
 * uniqueness is enforced in the Server Action against a normalized comparison
 * and backstopped by the unique slug constraint (AGENTS.md sections 8 and 9).
 */

export const TAXONOMY_NAME_MAX = 80;
export const TAXONOMY_DESCRIPTION_MAX = 300;
export const TAXONOMY_SLUG_MAX = 120;

const nameField = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(TAXONOMY_NAME_MAX, `Keep the name under ${TAXONOMY_NAME_MAX} characters.`);

const slugField = z.string().trim().max(TAXONOMY_SLUG_MAX).optional();

const descriptionField = z
  .string()
  .trim()
  .max(TAXONOMY_DESCRIPTION_MAX)
  .optional();

export const createCategorySchema = z
  .object({
    name: nameField,
    slug: slugField,
    description: descriptionField,
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: nameField,
    slug: slugField,
    description: descriptionField,
  })
  .strict();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createTagSchema = z
  .object({
    name: nameField,
    slug: slugField,
  })
  .strict();

export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: nameField,
    slug: slugField,
  })
  .strict();

export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export interface CategoryStoriesState {
  sort: StorySort;
  /** Requested page; the query layer clamps it to the real range. */
  page: number;
}

/**
 * Build a category detail URL from sort/page state.
 *
 * Defaults are omitted so the unfiltered page, the canonical and the cached
 * key all agree. Page resets to one when the sort changes because a new
 * ordering invalidates the old position.
 */
export function categoryStoryHref(
  slug: string,
  state: CategoryStoriesState,
): string {
  const params = new URLSearchParams();
  if (state.sort !== "recent") {
    params.set("sort", state.sort);
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  }
  const query = params.toString();
  return query ? `/categories/${slug}?${query}` : `/categories/${slug}`;
}

/**
 * Parse the category index `page` query value.
 *
 * Never throws: a malformed value falls back to page one, and the query layer
 * clamps the result to the real range.
 */
export function parseCategoryPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** Build the category index URL for a page, omitting the default. */
export function categoriesIndexHref(page: number): string {
  return page > 1 ? `/categories?page=${page}` : "/categories";
}
