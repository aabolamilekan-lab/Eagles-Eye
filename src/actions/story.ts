"use server";

import { ContentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireWriteCapability } from "@/lib/auth/guards";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { slugifyTitle, uniqueSlug } from "@/lib/slug";
import { deleteCover } from "@/lib/storage/covers";
import { revalidatePublicStoryCaches } from "@/lib/stories/revalidate";
import {
  canFeature,
  isStatusTransitionAllowed,
  statusAfter,
  type StoryStatusAction,
} from "@/lib/stories/transitions";
import type { StoryFormState } from "@/lib/stories/form";
import {
  createStorySchema,
  updateStorySchema,
} from "@/lib/validation/story";

/**
 * Story mutations.
 *
 * Every action re-checks authorization at call time (the layout guard is not a
 * substitute), validates before touching the database, keeps multi-write
 * changes in one transaction, and returns a safe typed result instead of
 * leaking a Prisma error. Status and `featured` are derived from the stored row
 * and the transition table, never from the form.
 * .agent/skills/story-management/SKILL.md.
 */

type StatusAction = Exclude<StoryStatusAction, "delete">;

const STATUS_NOTICE: Record<StatusAction, string> = {
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
  restore: "restored",
};

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * The editorial intent carried by the submit button that was pressed.
 *
 * The editor is one form: the buttons only differ by this value, so publishing
 * or archiving also saves the content the operator can see. Unknown values fall
 * back to `save`, and every intent still has to pass the transition table, so a
 * crafted value cannot force an illegal change.
 */
const STORY_INTENTS = [
  "save",
  "publish",
  "unpublish",
  "archive",
  "restore",
  "feature",
  "unfeature",
] as const;

type StoryIntent = (typeof STORY_INTENTS)[number];

function readIntent(formData: FormData): StoryIntent {
  const raw = readField(formData, "intent") ?? "";
  return (STORY_INTENTS as readonly string[]).includes(raw)
    ? (raw as StoryIntent)
    : "save";
}

function intentToStatusAction(intent: StoryIntent): StatusAction | null {
  switch (intent) {
    case "publish":
    case "unpublish":
    case "archive":
    case "restore":
      return intent;
    default:
      return null;
  }
}

/**
 * Apply a legal status transition inside an existing transaction.
 *
 * Shared by the status-only actions and the editor's save-and-transition path,
 * so the state machine has exactly one implementation. The caller has already
 * proven the transition is legal from the loaded row.
 */
async function applyStatusTransition(
  tx: Prisma.TransactionClient,
  story: { id: string; status: ContentStatus; publishedAt: Date | null },
  action: StatusAction,
): Promise<void> {
  const to = statusAfter(story.status, action);
  if (to === null) {
    throw new Error(`illegal story transition: ${story.status} -> ${action}`);
  }

  const data: Prisma.StoryUpdateInput = { status: to };
  if (action === "publish" && story.publishedAt === null) {
    data.publishedAt = new Date();
  }

  await tx.story.update({ where: { id: story.id }, data });

  if (action === "archive") {
    // Archiving cascades to the story's published chapters atomically.
    await tx.chapter.updateMany({
      where: { storyId: story.id, status: ContentStatus.PUBLISHED },
      data: { status: ContentStatus.ARCHIVED },
    });
  }
}

function sanitizeDescription(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = sanitizeRichText(value).trim();
  return cleaned === "" || cleaned === "<p></p>" ? null : cleaned;
}

function invalidForm(error: z.ZodError): StoryFormState {
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

function prismaCode(error: unknown): string {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : "unknown";
}

/**
 * Best-effort deletion of a cover object that is no longer referenced.
 *
 * The database is the source of truth. A failed cleanup leaves an orphaned
 * object (logged for a later sweep) but must never fail the operator's action
 * after the row has already changed. External URLs are ignored by `deleteCover`.
 */
async function deleteStoredCover(
  key: string | null,
  context: { storyId: string; reason: string },
): Promise<void> {
  if (!key) {
    return;
  }
  try {
    await deleteCover(key);
  } catch {
    logger.warn("story.cover.cleanup_failed", context);
  }
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const existing = await prisma.story.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null;
}

async function resolveCategoryId(
  categoryId: string | null,
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  if (!categoryId) {
    return { ok: true, id: null };
  }
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  return category ? { ok: true, id: category.id } : { ok: false };
}

interface InsertStoryParams {
  slug: string;
  title: string;
  author: string | null;
  shortDescription: string | null;
  description: string | null;
  coverImage: string | null;
  categoryId: string | null;
  tagIds: string[];
  status: ContentStatus;
  publishedAt: Date | null;
}

/** Insert a story and its tag joins in one transaction. Returns its id. */
async function insertStory(params: InsertStoryParams): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.story.create({
      data: {
        title: params.title,
        slug: params.slug,
        author: params.author,
        shortDescription: params.shortDescription,
        description: params.description,
        coverImage: params.coverImage,
        categoryId: params.categoryId,
        status: params.status,
        publishedAt: params.publishedAt,
      },
      select: { id: true },
    });

    if (params.tagIds.length > 0) {
      await tx.storyTag.createMany({
        data: params.tagIds.map((tagId) => ({ storyId: created.id, tagId })),
      });
    }

    return created.id;
  });
}

export async function createStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  await requireWriteCapability("stories.manage");

  const intent = readIntent(formData);
  const publish = intent === "publish";

  const parsed = createStorySchema.safeParse({
    title: readField(formData, "title"),
    slug: readField(formData, "slug"),
    author: readField(formData, "author"),
    shortDescription: readField(formData, "shortDescription"),
    description: readField(formData, "description"),
    coverImage: readField(formData, "coverImage"),
    categoryId: readField(formData, "categoryId"),
    tagIds: formData.getAll("tagIds").map(String),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const category = await resolveCategoryId(input.categoryId);
  if (!category.ok) {
    return {
      status: "error",
      fieldErrors: { categoryId: ["That category no longer exists."] },
    };
  }

  const baseSlug = slugifyTitle(input.title);
  let slug: string;
  if (input.slug) {
    const explicit = slugifyTitle(input.slug);
    if (await isSlugTaken(explicit)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
    slug = explicit;
  } else {
    slug = await uniqueSlug(baseSlug, isSlugTaken);
  }

  const story: Omit<InsertStoryParams, "slug"> = {
    title: input.title,
    author: input.author ?? null,
    shortDescription: input.shortDescription || null,
    description: sanitizeDescription(input.description),
    coverImage: input.coverImage,
    categoryId: category.id,
    tagIds: input.tagIds,
    status: publish ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    publishedAt: publish ? new Date() : null,
  };

  let createdId: string | null = null;
  try {
    createdId = await insertStory({ slug, ...story });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A concurrent insert took the generated slug; retry once with a fresh
      // suffix rather than surfacing the race to the operator.
      try {
        createdId = await insertStory({
          slug: await uniqueSlug(baseSlug, isSlugTaken),
          ...story,
        });
      } catch (retryError) {
        logger.error("story.create.retry_failed", {
          code: prismaCode(retryError),
        });
      }
    } else if (isForeignKeyViolation(error)) {
      return {
        status: "error",
        fieldErrors: { tagIds: ["One or more selected tags no longer exist."] },
      };
    } else {
      logger.error("story.create.failed", { code: prismaCode(error) });
    }
  }

  if (!createdId) {
    return {
      status: "error",
      message: "Could not create the story. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("story.created", { storyId: createdId });

  if (publish) {
    const publishedChapters = await prisma.chapter.count({
      where: { storyId: createdId, status: ContentStatus.PUBLISHED },
    });
    redirect(
      `/admin/stories/${createdId}/edit?notice=${
        publishedChapters === 0 ? "publish-warning" : "published"
      }`,
    );
  }

  redirect(`/admin/stories/${createdId}/edit?notice=created`);
}

export async function updateStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  await requireWriteCapability("stories.manage");

  const intent = readIntent(formData);

  const parsed = updateStorySchema.safeParse({
    id: readField(formData, "id"),
    title: readField(formData, "title"),
    slug: readField(formData, "slug"),
    author: readField(formData, "author"),
    shortDescription: readField(formData, "shortDescription"),
    description: readField(formData, "description"),
    coverImage: readField(formData, "coverImage"),
    categoryId: readField(formData, "categoryId"),
    tagIds: formData.getAll("tagIds").map(String),
    confirmSlugChange: formData.get("confirmSlugChange") === "on",
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const existing = await prisma.story.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      slug: true,
      status: true,
      publishedAt: true,
      coverImage: true,
    },
  });
  if (!existing) {
    return { status: "error", message: "This story no longer exists." };
  }

  const category = await resolveCategoryId(input.categoryId);
  if (!category.ok) {
    return {
      status: "error",
      fieldErrors: { categoryId: ["That category no longer exists."] },
    };
  }

  const desiredSlug = input.slug ? slugifyTitle(input.slug) : existing.slug;
  const slugChanged = desiredSlug !== existing.slug;
  if (slugChanged) {
    // Silent slug mutation of a live story is forbidden: the operator must
    // acknowledge that existing links will break (no redirect model exists).
    if (
      existing.status === ContentStatus.PUBLISHED &&
      !input.confirmSlugChange
    ) {
      return {
        status: "error",
        fieldErrors: {
          confirmSlugChange: [
            "Confirm the web address change before saving a published story.",
          ],
        },
      };
    }
    if (await isSlugTaken(desiredSlug)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
  }

  const statusAction = intentToStatusAction(intent);
  if (statusAction && !isStatusTransitionAllowed(existing.status, statusAction)) {
    return {
      status: "error",
      message: "That change is not allowed for this story's current state.",
    };
  }

  const feature =
    intent === "feature" ? true : intent === "unfeature" ? false : null;
  if (feature === true && !canFeature(existing.status)) {
    return {
      status: "error",
      message: "Only a published story can be featured.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.story.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          slug: desiredSlug,
          author: input.author ?? null,
          shortDescription: input.shortDescription || null,
          description: sanitizeDescription(input.description),
          coverImage: input.coverImage,
          categoryId: category.id,
        },
      });

      // Full tag replacement inside the same transaction.
      await tx.storyTag.deleteMany({ where: { storyId: existing.id } });
      if (input.tagIds.length > 0) {
        await tx.storyTag.createMany({
          data: input.tagIds.map((tagId) => ({
            storyId: existing.id,
            tagId,
          })),
        });
      }

      if (statusAction) {
        await applyStatusTransition(tx, existing, statusAction);
      }
      if (feature !== null) {
        await tx.story.update({
          where: { id: existing.id },
          data: { featured: feature },
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
    if (isForeignKeyViolation(error)) {
      return {
        status: "error",
        fieldErrors: { tagIds: ["One or more selected tags no longer exist."] },
      };
    }
    logger.error("story.update.failed", {
      storyId: existing.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not save the story. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("story.updated", { storyId: existing.id });

  if (existing.coverImage && existing.coverImage !== input.coverImage) {
    await deleteStoredCover(existing.coverImage, {
      storyId: existing.id,
      reason: "replaced",
    });
  }

  let notice = "saved";
  if (statusAction === "publish") {
    const publishedChapters = await prisma.chapter.count({
      where: { storyId: existing.id, status: ContentStatus.PUBLISHED },
    });
    notice = publishedChapters === 0 ? "publish-warning" : "published";
  } else if (statusAction) {
    notice = STATUS_NOTICE[statusAction];
  } else if (feature === true) {
    notice = "featured";
  } else if (feature === false) {
    notice = "unfeatured";
  }

  redirect(`/admin/stories/${existing.id}/edit?notice=${notice}`);
}

export async function deleteStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  // A delete cascades away every chapter, tag join and view row, and cannot be
  // undone from the UI. Tighter budget.
  await requireWriteCapability("stories.manage", "sensitive");

  const id = readField(formData, "id");
  const confirmation = (readField(formData, "confirmation") ?? "").trim();
  if (!id) {
    return { status: "error", message: "Missing story id." };
  }

  const story = await prisma.story.findUnique({
    where: { id },
    select: { id: true, title: true, coverImage: true },
  });
  if (!story) {
    return { status: "error", message: "This story no longer exists." };
  }
  if (confirmation !== story.title) {
    return {
      status: "error",
      fieldErrors: {
        confirmation: ["Type the story title exactly to confirm."],
      },
    };
  }

  try {
    // Chapters, StoryTag and StoryView rows cascade from the story row.
    await prisma.story.delete({ where: { id: story.id } });
  } catch (error) {
    logger.error("story.delete.failed", {
      storyId: story.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not delete the story. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("story.deleted", { storyId: story.id });

  await deleteStoredCover(story.coverImage, {
    storyId: story.id,
    reason: "story_deleted",
  });

  redirect("/admin/stories?notice=deleted");
}

async function runStatusAction(
  formData: FormData,
  action: StatusAction,
): Promise<StoryFormState> {
  await requireWriteCapability("stories.manage");

  const id = readField(formData, "id");
  if (!id) {
    return { status: "error", message: "Missing story id." };
  }

  const story = await prisma.story.findUnique({
    where: { id },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!story) {
    return { status: "error", message: "This story no longer exists." };
  }

  if (!isStatusTransitionAllowed(story.status, action)) {
    logger.warn("story.transition.rejected", {
      storyId: story.id,
      action,
      from: story.status,
    });
    return {
      status: "error",
      message: "That change is not allowed for this story's current state.",
    };
  }

  const to = statusAfter(story.status, action);
  if (to === null) {
    return {
      status: "error",
      message: "That change is not allowed for this story's current state.",
    };
  }

  try {
    await prisma.$transaction((tx) =>
      applyStatusTransition(tx, story, action),
    );
  } catch (error) {
    logger.error("story.transition.failed", {
      storyId: story.id,
      action,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not update the story. Please try again.",
    };
  }

  let notice = STATUS_NOTICE[action];
  if (action === "publish") {
    const publishedChapters = await prisma.chapter.count({
      where: { storyId: story.id, status: ContentStatus.PUBLISHED },
    });
    if (publishedChapters === 0) {
      notice = "publish-warning";
    }
  }

  revalidatePublicStoryCaches();
  logger.info("story.transition.applied", {
    storyId: story.id,
    action,
    to,
  });
  redirect(`/admin/stories/${story.id}/edit?notice=${notice}`);
}

export async function publishStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  return runStatusAction(formData, "publish");
}

export async function unpublishStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  return runStatusAction(formData, "unpublish");
}

export async function archiveStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  return runStatusAction(formData, "archive");
}

export async function restoreStoryAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  return runStatusAction(formData, "restore");
}

export async function setFeaturedAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  await requireWriteCapability("stories.manage");

  const id = readField(formData, "id");
  const featured = readField(formData, "featured") === "true";
  if (!id) {
    return { status: "error", message: "Missing story id." };
  }

  const story = await prisma.story.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!story) {
    return { status: "error", message: "This story no longer exists." };
  }
  if (featured && !canFeature(story.status)) {
    return {
      status: "error",
      message: "Only a published story can be featured.",
    };
  }

  try {
    await prisma.story.update({
      where: { id: story.id },
      data: { featured },
    });
  } catch (error) {
    logger.error("story.feature.failed", {
      storyId: story.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not update the story. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("story.featured.updated", {
    storyId: story.id,
    featured,
  });
  redirect(
    `/admin/stories/${story.id}/edit?notice=${featured ? "featured" : "unfeatured"}`,
  );
}

export async function removeCoverAction(
  _previous: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  // Removal deletes the stored object, which cannot be undone from the UI.
  await requireWriteCapability("stories.manage", "sensitive");

  const id = readField(formData, "id");
  if (!id) {
    return { status: "error", message: "Missing story id." };
  }

  const story = await prisma.story.findUnique({
    where: { id },
    select: { id: true, coverImage: true },
  });
  if (!story) {
    return { status: "error", message: "This story no longer exists." };
  }

  try {
    await prisma.story.update({
      where: { id: story.id },
      data: { coverImage: null },
    });
  } catch (error) {
    logger.error("story.cover.remove_failed", {
      storyId: story.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not remove the cover. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("story.cover.removed", { storyId: story.id });

  await deleteStoredCover(story.coverImage, {
    storyId: story.id,
    reason: "removed",
  });

  redirect(`/admin/stories/${story.id}/edit?notice=cover-removed`);
}
