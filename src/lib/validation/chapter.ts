import { z } from "zod";

/**
 * Zod schemas for the admin chapter surfaces.
 *
 * Every schema is `.strict()`, so unknown keys never reach Prisma, and the
 * input types come from `z.infer`, never a hand-written duplicate. Status is
 * deliberately absent: the action derives it from the stored row and the
 * transition table, never from the form. `chapterNumber` is optional and is
 * treated as a requested position, clamped by the ordering helper rather than
 * trusted as a literal stored number. `.agent/skills/chapter-management/SKILL.md`.
 */
export const CHAPTER_TITLE_MAX = 200;
export const CHAPTER_CONTENT_MAX = 200_000;
export const CHAPTER_SLUG_MAX = 120;
export const CHAPTER_MAX_COUNT = 1000;

const SLUG_MAX = CHAPTER_SLUG_MAX;

const storyIdField = z.string().trim().min(1).max(64);
const idField = z.string().trim().min(1).max(64);
const titleField = z
  .string()
  .trim()
  .min(1, "A title is required.")
  .max(CHAPTER_TITLE_MAX);
const slugField = z.string().trim().max(SLUG_MAX).optional();
const contentField = z.string().max(CHAPTER_CONTENT_MAX).optional();

export const createChapterSchema = z
  .object({
    storyId: storyIdField,
    title: titleField,
    slug: slugField,
    content: contentField,
  })
  .strict();

export type CreateChapterInput = z.infer<typeof createChapterSchema>;

export const updateChapterSchema = z
  .object({
    storyId: storyIdField,
    id: idField,
    title: titleField,
    slug: slugField,
    content: contentField,
    /** Requested 1-based position; not a stored value until reordered. */
    chapterNumber: z.coerce
      .number()
      .int()
      .min(1)
      .max(CHAPTER_MAX_COUNT)
      .optional(),
    /** Required only when a published chapter's slug actually changes. */
    confirmSlugChange: z.boolean().optional().default(false),
  })
  .strict();

export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;

export const reorderChaptersSchema = z
  .object({
    storyId: storyIdField,
    order: z
      .array(z.string().trim().min(1).max(64))
      .min(1)
      .max(CHAPTER_MAX_COUNT),
  })
  .strict();

export type ReorderChaptersInput = z.infer<typeof reorderChaptersSchema>;

export const deleteChapterSchema = z
  .object({
    storyId: storyIdField,
    id: idField,
    confirmation: z.string().max(CHAPTER_TITLE_MAX),
  })
  .strict();

export type DeleteChapterInput = z.infer<typeof deleteChapterSchema>;

export const chapterStatusSchema = z
  .object({ storyId: storyIdField, id: idField })
  .strict();

export type ChapterStatusInput = z.infer<typeof chapterStatusSchema>;
