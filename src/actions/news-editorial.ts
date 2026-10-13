"use server";

import { ArticleSyncStatus, ContentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireWriteCapability } from "@/lib/auth/guards";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { revalidatePublicStoryCaches } from "@/lib/stories/revalidate";
import { isStatusTransitionAllowed } from "@/lib/stories/transitions";
import {
  publishNewsSchema,
  rejectNewsSchema,
  saveNewsDraftSchema,
} from "@/lib/validation/news-editorial";

export interface EditorialActionResult {
  ok: boolean;
  message?: string;
  storyId?: string;
  slug?: string;
  updatedAt?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function parseFormDataValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Save edits to a news story draft without altering DRAFT status or setting publishedAt.
 */
export async function saveNewsDraftAction(
  formData: FormData,
): Promise<EditorialActionResult> {
  // 1. Server-side authorization check (write capability + rate limit budget)
  await requireWriteCapability("stories.manage", "normal");

  // 2. Parse and validate input at boundary
  const parsed = saveNewsDraftSchema.safeParse({
    storyId: parseFormDataValue(formData, "storyId"),
    expectedUpdatedAt: parseFormDataValue(formData, "expectedUpdatedAt"),
    title: parseFormDataValue(formData, "title"),
    author: parseFormDataValue(formData, "author"),
    shortDescription: parseFormDataValue(formData, "shortDescription"),
    description: parseFormDataValue(formData, "description"),
    categoryId: parseFormDataValue(formData, "categoryId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the validation errors before saving.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { storyId, expectedUpdatedAt, title, author, shortDescription, description, categoryId } =
    parsed.data;

  // 3. Category existence check if provided
  if (categoryId) {
    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!categoryExists) {
      return {
        ok: false,
        error: "Selected category does not exist.",
        fieldErrors: { categoryId: ["Selected category not found."] },
      };
    }
  }

  // 4. Sanitize rich text description
  const sanitizedDescription = description ? sanitizeRichText(description).trim() : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 5. Concurrency & draft eligibility check inside transaction
      const existing = await tx.story.findUnique({
        where: { id: storyId },
        select: { id: true, status: true, updatedAt: true },
      });

      if (!existing) {
        return { ok: false, error: "The story could not be found." };
      }

      if (existing.status !== ContentStatus.DRAFT) {
        return {
          ok: false,
          error: `Only draft stories can be saved as drafts. Current status: ${existing.status}.`,
        };
      }

      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        return {
          ok: false,
          error:
            "This story was modified concurrently by another editor. Please refresh the page to load latest changes.",
        };
      }

      // 6. Update story draft preserving DRAFT status and null publishedAt
      const updated = await tx.story.update({
        where: { id: storyId },
        data: {
          title,
          author,
          shortDescription,
          description: sanitizedDescription,
          categoryId: categoryId || null,
          status: ContentStatus.DRAFT, // INVARIANT: always DRAFT
          publishedAt: null, // INVARIANT: never published
        },
        select: { id: true, updatedAt: true },
      });

      return {
        ok: true,
        storyId: updated.id,
        updatedAt: updated.updatedAt.toISOString(),
        message: "Draft saved successfully.",
      };
    });

    if (result.ok) {
      revalidatePath("/admin");
      revalidatePath("/admin/stories");
      revalidatePath("/admin/news");
      revalidatePath(`/admin/news/${storyId}`);
    }

    return result;
  } catch (_err) {
    return {
      ok: false,
      error: "An unexpected error occurred while saving the draft.",
    };
  }
}

/**
 * Approve and publish an eligible news story draft with atomic status transition and cache invalidation.
 */
export async function approveAndPublishNewsAction(
  formData: FormData,
): Promise<EditorialActionResult> {
  // 1. Server-side authorization check
  await requireWriteCapability("stories.manage", "normal");

  // 2. Parse and validate publishing requirements
  const parsed = publishNewsSchema.safeParse({
    storyId: parseFormDataValue(formData, "storyId"),
    expectedUpdatedAt: parseFormDataValue(formData, "expectedUpdatedAt"),
    title: parseFormDataValue(formData, "title"),
    author: parseFormDataValue(formData, "author"),
    shortDescription: parseFormDataValue(formData, "shortDescription"),
    description: parseFormDataValue(formData, "description"),
    categoryId: parseFormDataValue(formData, "categoryId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please complete all required fields before publishing.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { storyId, expectedUpdatedAt, title, author, shortDescription, description, categoryId } =
    parsed.data;

  // 3. Verify category existence
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, slug: true },
  });

  if (!category) {
    return {
      ok: false,
      error: "Assigned category does not exist.",
      fieldErrors: { categoryId: ["Please select a valid category."] },
    };
  }

  // 4. Sanitize rich text description
  const sanitizedDescription = sanitizeRichText(description).trim();
  if (sanitizedDescription === "" || sanitizedDescription === "<p></p>") {
    return {
      ok: false,
      error: "Article content cannot be empty after sanitization.",
      fieldErrors: { description: ["Content is required."] },
    };
  }

  let publishedSlug: string = "";

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 5. Concurrency, transition validation, and imported article verification
      const existing = await tx.story.findUnique({
        where: { id: storyId },
        select: {
          id: true,
          slug: true,
          status: true,
          updatedAt: true,
          importedArticles: {
            take: 1,
            select: { id: true },
          },
        },
      });

      if (!existing) {
        return { ok: false, error: "The story could not be found." };
      }

      if (existing.status !== ContentStatus.DRAFT) {
        return {
          ok: false,
          error: `Only draft stories can be published. Current status: ${existing.status}.`,
        };
      }

      if (!isStatusTransitionAllowed(existing.status, "publish")) {
        return {
          ok: false,
          error: "Publishing transition is not allowed from current story status.",
        };
      }

      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        return {
          ok: false,
          error:
            "This story was modified concurrently by another editor. Please refresh before publishing.",
        };
      }

      publishedSlug = existing.slug;
      const now = new Date();

      // 6. Atomically update Story to PUBLISHED
      await tx.story.update({
        where: { id: storyId },
        data: {
          title,
          author,
          shortDescription,
          description: sanitizedDescription,
          categoryId: category.id,
          status: ContentStatus.PUBLISHED, // Transitions to PUBLISHED
          publishedAt: now, // Server-assigned publication timestamp
        },
      });

      // 7. Update linked ImportedArticle
      if (existing.importedArticles.length > 0) {
        const importedId = existing.importedArticles[0]!.id;
        await tx.importedArticle.update({
          where: { id: importedId },
          data: {
            syncStatus: ArticleSyncStatus.IMPORTED,
          },
        });
      }

      return {
        ok: true,
        storyId,
        slug: publishedSlug,
        message: "Story successfully approved and published.",
      };
    });

    if (!result.ok) {
      return result;
    }

    // 8. Invalidate public caches and admin views after successful transaction
    revalidatePublicStoryCaches();
    revalidatePath(`/stories/${publishedSlug}`);
    revalidatePath("/admin");
    revalidatePath("/admin/stories");
    revalidatePath("/admin/news");
    revalidatePath(`/admin/news/${storyId}`);

    return result;
  } catch (_err) {
    return {
      ok: false,
      error: "An unexpected error occurred during publication.",
    };
  }
}

/**
 * Reject an unwanted news draft, transitioning Story to ARCHIVED and setting ImportedArticle to FILTERED.
 */
export async function rejectNewsDraftAction(
  formData: FormData,
): Promise<EditorialActionResult> {
  // 1. Server-side authorization check (destructive/sensitive action budget)
  await requireWriteCapability("stories.manage", "sensitive");

  // 2. Parse and validate input
  const parsed = rejectNewsSchema.safeParse({
    storyId: parseFormDataValue(formData, "storyId"),
    expectedUpdatedAt: parseFormDataValue(formData, "expectedUpdatedAt"),
    reason: parseFormDataValue(formData, "reason"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input parameters for rejection.",
    };
  }

  const { storyId, expectedUpdatedAt } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 3. Concurrency and transition check inside transaction
      const existing = await tx.story.findUnique({
        where: { id: storyId },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          importedArticles: {
            take: 1,
            select: { id: true },
          },
        },
      });

      if (!existing) {
        return { ok: false, error: "The story could not be found." };
      }

      if (existing.status !== ContentStatus.DRAFT) {
        return {
          ok: false,
          error: `Only draft stories can be rejected. Current status: ${existing.status}.`,
        };
      }

      if (!isStatusTransitionAllowed(existing.status, "archive")) {
        return {
          ok: false,
          error: "Archiving transition is not permitted from current story state.",
        };
      }

      if (existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        return {
          ok: false,
          error:
            "This story was modified concurrently by another editor. Please refresh before rejecting.",
        };
      }

      // 4. Atomically transition Story to ARCHIVED
      await tx.story.update({
        where: { id: storyId },
        data: {
          status: ContentStatus.ARCHIVED,
        },
      });

      // 5. Set linked ImportedArticle to FILTERED
      if (existing.importedArticles.length > 0) {
        const importedId = existing.importedArticles[0]!.id;
        await tx.importedArticle.update({
          where: { id: importedId },
          data: {
            syncStatus: ArticleSyncStatus.FILTERED,
          },
        });
      }

      return {
        ok: true,
        storyId,
        message: "News draft has been rejected and archived. It will not be re-imported.",
      };
    });

    if (result.ok) {
      revalidatePath("/admin");
      revalidatePath("/admin/stories");
      revalidatePath("/admin/news");
    }

    return result;
  } catch (_err) {
    return {
      ok: false,
      error: "An unexpected error occurred while rejecting the draft.",
    };
  }
}
