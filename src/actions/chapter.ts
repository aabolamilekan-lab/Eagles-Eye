"use server";

import { ContentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireWriteCapability } from "@/lib/auth/guards";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { slugifyTitle, uniqueChapterSlug } from "@/lib/slug";
import { revalidatePublicStoryCaches } from "@/lib/stories/revalidate";
import {
  chapterStatusAfter,
  isChapterTransitionAllowed,
  type ChapterStatusAction,
} from "@/lib/chapters/transitions";
import {
  TEMPORARY_ORDER_OFFSET,
  moveChapter,
  planReorder,
} from "@/lib/chapters/order";
import { isChapterContentEmpty } from "@/lib/chapters/content";
import type { ChapterFormState } from "@/lib/chapters/form";
import {
  chapterStatusSchema,
  createChapterSchema,
  deleteChapterSchema,
  reorderChaptersSchema,
  updateChapterSchema,
} from "@/lib/validation/chapter";

/**
 * Chapter mutations.
 *
 * Every action re-checks `chapters.manage` at call time (the layout guard is
 * not a substitute), validates before touching the database, and scopes every
 * lookup by the parent `storyId` so a bare chapter id can never authorise a
 * mutation. `chapterNumber` is kept gap-free: reorder and delete-compaction are
 * two-phase writes inside a serializable transaction, retried once on a unique
 * or serialization conflict. Content is sanitized on every write.
 * `.agent/skills/chapter-management/SKILL.md`.
 */

type StatusAction = Exclude<ChapterStatusAction, "delete">;

const STATUS_NOTICE: Record<StatusAction, string> = {
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
};

const CHAPTER_INTENTS = ["save", "publish", "unpublish", "archive"] as const;
type ChapterIntent = (typeof CHAPTER_INTENTS)[number];

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * The editorial intent carried by the submit button that was pressed.
 *
 * The editor is one form: the buttons differ only by this value, so publishing
 * or archiving also saves the content the operator can see. Unknown values fall
 * back to `save`, and every intent still has to pass the transition table, so a
 * crafted value cannot force an illegal change.
 */
function readIntent(formData: FormData): ChapterIntent {
  const raw = readField(formData, "intent") ?? "";
  return (CHAPTER_INTENTS as readonly string[]).includes(raw)
    ? (raw as ChapterIntent)
    : "save";
}

function intentToStatusAction(intent: ChapterIntent): StatusAction | null {
  switch (intent) {
    case "publish":
    case "unpublish":
    case "archive":
      return intent;
    default:
      return null;
  }
}

function sanitizeChapterContent(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return sanitizeRichText(value).trim();
}

function invalidForm(error: z.ZodError): ChapterFormState {
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(flattened)) {
    if (messages && messages.length > 0) {
      fieldErrors[key] = messages;
    }
  }
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors,
  };
}

function prismaCode(error: unknown): string {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : "unknown";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

/** A unique or serialization conflict that is safe to retry once. */
function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function withSerializableRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isRetryableConflict(error)) {
      return await run();
    }
    throw error;
  }
}

async function isChapterSlugTaken(
  storyId: string,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await prisma.chapter.findFirst({
    where: {
      storyId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Write the final contiguous order `1..n` for a story.
 *
 * Phase one shifts every row of the story by a constant larger than any real
 * number, so no final value can collide with a row that has not been updated
 * yet. Phase two writes `1..n` from the validated order. Runs inside the
 * caller's serializable transaction.
 */
async function applyChapterOrder(
  tx: Prisma.TransactionClient,
  storyId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await tx.chapter.updateMany({
    where: { storyId },
    data: { chapterNumber: { increment: TEMPORARY_ORDER_OFFSET } },
  });

  for (let index = 0; index < orderedIds.length; index += 1) {
    await tx.chapter.update({
      where: { id: orderedIds[index] },
      data: { chapterNumber: index + 1 },
    });
  }
}

/**
 * Apply a legal status transition inside an existing transaction.
 *
 * `publishedAt` is set only the first time a chapter is published and is never
 * nulled on unpublish or archive, so the original publication date survives.
 */
async function applyChapterStatus(
  tx: Prisma.TransactionClient,
  chapter: {
    id: string;
    status: ContentStatus;
    publishedAt: Date | null;
  },
  action: StatusAction,
): Promise<void> {
  const to = chapterStatusAfter(chapter.status, action);
  if (to === null) {
    throw new Error(`illegal chapter transition: ${chapter.status} -> ${action}`);
  }

  const data: Prisma.ChapterUpdateInput = { status: to };
  if (action === "publish" && chapter.publishedAt === null) {
    data.publishedAt = new Date();
  }

  await tx.chapter.update({ where: { id: chapter.id }, data });
}

interface InsertChapterParams {
  storyId: string;
  slug: string;
  title: string;
  content: string;
}

/** Append a draft chapter, `chapterNumber = max + 1`, in one transaction. */
async function insertChapter(params: InsertChapterParams): Promise<string> {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const aggregate = await tx.chapter.aggregate({
          where: { storyId: params.storyId },
          _max: { chapterNumber: true },
        });
        const chapterNumber = (aggregate._max.chapterNumber ?? 0) + 1;

        const created = await tx.chapter.create({
          data: {
            storyId: params.storyId,
            chapterNumber,
            title: params.title,
            slug: params.slug,
            content: params.content,
            status: ContentStatus.DRAFT,
          },
          select: { id: true },
        });

        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export async function createChapterAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  await requireWriteCapability("chapters.manage");

  const parsed = createChapterSchema.safeParse({
    storyId: readField(formData, "storyId"),
    title: readField(formData, "title"),
    slug: readField(formData, "slug"),
    content: readField(formData, "content"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const story = await prisma.story.findUnique({
    where: { id: input.storyId },
    select: { id: true },
  });
  if (!story) {
    return { status: "error", message: "This story no longer exists." };
  }

  const content = sanitizeChapterContent(input.content);
  const isTaken = (candidate: string) =>
    isChapterSlugTaken(input.storyId, candidate);

  let slug: string;
  if (input.slug) {
    const candidate = slugifyTitle(input.slug, "chapter");
    if (await isTaken(candidate)) {
      return {
        status: "error",
        fieldErrors: {
          slug: ["That web address is already in use in this story."],
        },
      };
    }
    slug = candidate;
  } else {
    slug = await uniqueChapterSlug(input.title, isTaken);
  }

  let createdId: string | null = null;
  try {
    createdId = await insertChapter({
      storyId: input.storyId,
      slug,
      title: input.title,
      content,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A concurrent append took the generated slug or the appended number;
      // recompute and retry once rather than surfacing the race.
      const freshSlug = input.slug
        ? slug
        : await uniqueChapterSlug(input.title, isTaken);
      try {
        createdId = await insertChapter({
          storyId: input.storyId,
          slug: freshSlug,
          title: input.title,
          content,
        });
      } catch (retryError) {
        if (isUniqueViolation(retryError)) {
          return {
            status: "error",
            fieldErrors: {
              slug: ["That web address is already in use in this story."],
            },
          };
        }
        logger.error("chapter.create.retry_failed", {
          code: prismaCode(retryError),
        });
        return {
          status: "error",
          message: "Could not create the chapter. Please try again.",
        };
      }
    } else if (isForeignKeyViolation(error)) {
      return { status: "error", message: "This story no longer exists." };
    } else {
      logger.error("chapter.create.failed", { code: prismaCode(error) });
      return {
        status: "error",
        message: "Could not create the chapter. Please try again.",
      };
    }
  }

  if (!createdId) {
    return {
      status: "error",
      message: "Could not create the chapter. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("chapter.created", {
    storyId: input.storyId,
    chapterId: createdId,
  });
  redirect(
    `/admin/stories/${input.storyId}/chapters/${createdId}/edit?notice=created`,
  );
}

export async function updateChapterAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  await requireWriteCapability("chapters.manage");

  const intent = readIntent(formData);
  const rawNumber = readField(formData, "chapterNumber");

  const parsed = updateChapterSchema.safeParse({
    storyId: readField(formData, "storyId"),
    id: readField(formData, "id"),
    title: readField(formData, "title"),
    slug: readField(formData, "slug"),
    content: readField(formData, "content"),
    chapterNumber:
      rawNumber === undefined || rawNumber === "" ? undefined : rawNumber,
    confirmSlugChange: formData.get("confirmSlugChange") === "on",
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const existing = await prisma.chapter.findFirst({
    where: { id: input.id, storyId: input.storyId },
    select: {
      id: true,
      slug: true,
      status: true,
      publishedAt: true,
      chapterNumber: true,
    },
  });
  if (!existing) {
    return { status: "error", message: "This chapter no longer exists." };
  }

  const content = sanitizeChapterContent(input.content);

  const desiredSlug = input.slug
    ? slugifyTitle(input.slug, "chapter")
    : existing.slug;
  const slugChanged = desiredSlug !== existing.slug;
  if (slugChanged) {
    // Silent slug mutation of a live chapter is forbidden: the operator must
    // acknowledge that existing links will break (no redirect model exists).
    if (
      existing.status === ContentStatus.PUBLISHED &&
      !input.confirmSlugChange
    ) {
      return {
        status: "error",
        fieldErrors: {
          confirmSlugChange: [
            "Confirm the web address change before saving a published chapter.",
          ],
        },
      };
    }
    if (await isChapterSlugTaken(input.storyId, desiredSlug, existing.id)) {
      return {
        status: "error",
        fieldErrors: {
          slug: ["That web address is already in use in this story."],
        },
      };
    }
  }

  const statusAction = intentToStatusAction(intent);
  if (statusAction) {
    if (!isChapterTransitionAllowed(existing.status, statusAction)) {
      return {
        status: "error",
        message: "That change is not allowed for this chapter's current state.",
      };
    }
    if (statusAction === "publish" && isChapterContentEmpty(content)) {
      return {
        status: "error",
        fieldErrors: {
          content: ["Add some content before publishing this chapter."],
        },
      };
    }
  }

  const targetNumber = input.chapterNumber ?? existing.chapterNumber;
  const numberChanged = targetNumber !== existing.chapterNumber;

  try {
    await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.chapter.update({
            where: { id: existing.id },
            data: { title: input.title, slug: desiredSlug, content },
          });

          if (numberChanged) {
            const rows = await tx.chapter.findMany({
              where: { storyId: input.storyId },
              orderBy: [{ chapterNumber: "asc" }, { id: "asc" }],
              select: { id: true },
            });
            const ordered = moveChapter(
              rows.map((row) => row.id),
              existing.id,
              targetNumber,
            );
            await applyChapterOrder(tx, input.storyId, ordered);
          }

          if (statusAction) {
            await applyChapterStatus(tx, existing, statusAction);
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: {
          slug: ["That web address is already in use in this story."],
        },
      };
    }
    logger.error("chapter.update.failed", {
      chapterId: existing.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not save the chapter. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("chapter.updated", {
    storyId: input.storyId,
    chapterId: existing.id,
    moved: numberChanged,
  });

  const notice = statusAction ? STATUS_NOTICE[statusAction] : "saved";
  redirect(
    `/admin/stories/${input.storyId}/chapters/${existing.id}/edit?notice=${notice}`,
  );
}

export async function deleteChapterAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  // A delete discards written content and cannot be undone from the UI, so it
  // takes the tighter budget.
  await requireWriteCapability("chapters.manage", "sensitive");

  const parsed = deleteChapterSchema.safeParse({
    storyId: readField(formData, "storyId"),
    id: readField(formData, "id"),
    confirmation: readField(formData, "confirmation") ?? "",
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const chapter = await prisma.chapter.findFirst({
    where: { id: input.id, storyId: input.storyId },
    select: { id: true, title: true },
  });
  if (!chapter) {
    return { status: "error", message: "This chapter no longer exists." };
  }
  if (input.confirmation.trim() !== chapter.title) {
    return {
      status: "error",
      fieldErrors: {
        confirmation: ["Type the chapter title exactly to confirm."],
      },
    };
  }

  let remainingPublished = 0;
  let storyStatus: ContentStatus = ContentStatus.DRAFT;

  try {
    const result = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.chapter.delete({ where: { id: chapter.id } });

          const remaining = await tx.chapter.findMany({
            where: { storyId: input.storyId },
            orderBy: [{ chapterNumber: "asc" }, { id: "asc" }],
            select: { id: true, status: true },
          });

          if (remaining.length > 0) {
            await applyChapterOrder(
              tx,
              input.storyId,
              remaining.map((row) => row.id),
            );
          }

          const story = await tx.story.findUnique({
            where: { id: input.storyId },
            select: { status: true },
          });

          return {
            publishedCount: remaining.filter(
              (row) => row.status === ContentStatus.PUBLISHED,
            ).length,
            storyStatus: story?.status ?? ContentStatus.DRAFT,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    remainingPublished = result.publishedCount;
    storyStatus = result.storyStatus;
  } catch (error) {
    logger.error("chapter.delete.failed", {
      chapterId: chapter.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not delete the chapter. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("chapter.deleted", {
    storyId: input.storyId,
    chapterId: chapter.id,
  });

  // A published story losing its last published chapter vanishes from public
  // view; the warning names that consequence precisely.
  const notice =
    storyStatus === ContentStatus.PUBLISHED && remainingPublished === 0
      ? "deleted-empty"
      : "deleted";
  redirect(`/admin/stories/${input.storyId}/chapters?notice=${notice}`);
}

export async function reorderChaptersAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  // A reorder rewrites every sibling's chapter number in one transaction, so a
  // loop of these is the most expensive write in the app. Tighter budget.
  await requireWriteCapability("chapters.manage", "sensitive");

  const parsed = reorderChaptersSchema.safeParse({
    storyId: readField(formData, "storyId"),
    order: formData.getAll("order").map(String),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const story = await prisma.story.findUnique({
    where: { id: input.storyId },
    select: { id: true },
  });
  if (!story) {
    return { status: "error", message: "This story no longer exists." };
  }

  const current = await prisma.chapter.findMany({
    where: { storyId: input.storyId },
    orderBy: [{ chapterNumber: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const plan = planReorder(
    current.map((row) => row.id),
    input.order,
  );
  if (!plan.ok) {
    return { status: "error", message: plan.error };
  }

  try {
    await withSerializableRetry(() =>
      prisma.$transaction(
        (tx) => applyChapterOrder(tx, input.storyId, input.order),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    logger.error("chapter.reorder.failed", {
      storyId: input.storyId,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "The chapter list changed. Reload and try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("chapter.reordered", {
    storyId: input.storyId,
    count: input.order.length,
  });
  redirect(`/admin/stories/${input.storyId}/chapters?notice=reordered`);
}

async function runStatusAction(
  formData: FormData,
  action: StatusAction,
): Promise<ChapterFormState> {
  await requireWriteCapability("chapters.manage");

  const parsed = chapterStatusSchema.safeParse({
    storyId: readField(formData, "storyId"),
    id: readField(formData, "id"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const chapter = await prisma.chapter.findFirst({
    where: { id: input.id, storyId: input.storyId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      content: true,
    },
  });
  if (!chapter) {
    return { status: "error", message: "This chapter no longer exists." };
  }

  if (!isChapterTransitionAllowed(chapter.status, action)) {
    logger.warn("chapter.transition.rejected", {
      chapterId: chapter.id,
      action,
      from: chapter.status,
    });
    return {
      status: "error",
      message: "That change is not allowed for this chapter's current state.",
    };
  }

  if (action === "publish" && isChapterContentEmpty(chapter.content)) {
    return {
      status: "error",
      fieldErrors: {
        content: ["Add some content before publishing this chapter."],
      },
    };
  }

  try {
    await prisma.$transaction((tx) => applyChapterStatus(tx, chapter, action));
  } catch (error) {
    logger.error("chapter.transition.failed", {
      chapterId: chapter.id,
      action,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not update the chapter. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("chapter.transition.applied", {
    storyId: input.storyId,
    chapterId: chapter.id,
    action,
  });
  redirect(
    `/admin/stories/${input.storyId}/chapters/${chapter.id}/edit?notice=${STATUS_NOTICE[action]}`,
  );
}

export async function publishChapterAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  return runStatusAction(formData, "publish");
}

export async function unpublishChapterAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  return runStatusAction(formData, "unpublish");
}

export async function archiveChapterAction(
  _previous: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  return runStatusAction(formData, "archive");
}
