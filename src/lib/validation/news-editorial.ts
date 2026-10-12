import { z } from "zod";
import {
  STORY_TITLE_MAX,
  STORY_AUTHOR_MAX,
  STORY_SHORT_DESCRIPTION_MAX,
  STORY_DESCRIPTION_MAX,
} from "./story";

/**
 * Editorial Review Zod Validation Schemas.
 *
 * Strict boundary validation for saving, publishing, and rejecting news drafts.
 * Protects against malformed data, enforces field limits, and requires all mandatory
 * fields before a draft can transition to PUBLISHED.
 */

export const saveNewsDraftSchema = z.object({
  storyId: z.string().trim().min(1, "Story ID is required."),
  expectedUpdatedAt: z.string().trim().min(1, "Expected updated timestamp is required for concurrency control."),
  title: z
    .string()
    .trim()
    .min(1, "A title is required.")
    .max(STORY_TITLE_MAX, `Title cannot exceed ${STORY_TITLE_MAX} characters.`),
  author: z
    .string()
    .trim()
    .max(STORY_AUTHOR_MAX, `Author cannot exceed ${STORY_AUTHOR_MAX} characters.`)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  shortDescription: z
    .string()
    .trim()
    .max(STORY_SHORT_DESCRIPTION_MAX, `Short description cannot exceed ${STORY_SHORT_DESCRIPTION_MAX} characters.`)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  description: z
    .string()
    .trim()
    .max(STORY_DESCRIPTION_MAX, `Content cannot exceed ${STORY_DESCRIPTION_MAX} characters.`)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  categoryId: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const publishNewsSchema = z.object({
  storyId: z.string().trim().min(1, "Story ID is required."),
  expectedUpdatedAt: z.string().trim().min(1, "Expected updated timestamp is required for concurrency control."),
  title: z
    .string()
    .trim()
    .min(1, "A title is required to publish.")
    .max(STORY_TITLE_MAX, `Title cannot exceed ${STORY_TITLE_MAX} characters.`),
  author: z
    .string()
    .trim()
    .max(STORY_AUTHOR_MAX, `Author cannot exceed ${STORY_AUTHOR_MAX} characters.`)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  shortDescription: z
    .string()
    .trim()
    .min(1, "A short description is required to publish.")
    .max(STORY_SHORT_DESCRIPTION_MAX, `Short description cannot exceed ${STORY_SHORT_DESCRIPTION_MAX} characters.`),
  description: z
    .string()
    .trim()
    .min(1, "Article content is required to publish.")
    .max(STORY_DESCRIPTION_MAX, `Content cannot exceed ${STORY_DESCRIPTION_MAX} characters.`),
  categoryId: z
    .string()
    .trim()
    .min(1, "A category must be assigned before publishing."),
});

export const rejectNewsSchema = z.object({
  storyId: z.string().trim().min(1, "Story ID is required."),
  expectedUpdatedAt: z.string().trim().min(1, "Expected updated timestamp is required for concurrency control."),
  reason: z.string().trim().max(500).optional(),
});

export type SaveNewsDraftInput = z.infer<typeof saveNewsDraftSchema>;
export type PublishNewsInput = z.infer<typeof publishNewsSchema>;
export type RejectNewsInput = z.infer<typeof rejectNewsSchema>;
