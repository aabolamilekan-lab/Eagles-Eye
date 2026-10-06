"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireWriteCapability } from "@/lib/auth/guards";
import { slugifyTitle, uniqueSlug } from "@/lib/slug";
import { revalidatePublicStoryCaches } from "@/lib/stories/revalidate";
import type { TaxonomyFormState } from "@/lib/taxonomy/form";
import {
  createTagSchema,
  updateTagSchema,
} from "@/lib/validation/taxonomy";

/**
 * Tag mutations.
 *
 * Mirrors `src/actions/category.ts`: capability re-checked at call time,
 * validated before the database, names compared case-insensitively, safe typed
 * errors. Deleting a tag is allowed even while it is attached, because
 * `StoryTag` cascades; the confirmation names the record, and the danger zone
 * states how many stories lose the tag (AGENTS.md sections 8, 9, 13 and 14).
 */

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function invalidForm(error: z.ZodError): TaxonomyFormState {
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

function prismaCode(error: unknown): string {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : "unknown";
}

async function isNameTaken(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.tag.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      id: excludeId ? { not: excludeId } : undefined,
    },
    select: { id: true },
  });
  return existing !== null;
}

async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.tag.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null && existing.id !== excludeId;
}

export async function createTagAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  await requireWriteCapability("tags.manage");

  const parsed = createTagSchema.safeParse({
    name: readField(formData, "name"),
    slug: readField(formData, "slug"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  if (await isNameTaken(input.name)) {
    return {
      status: "error",
      fieldErrors: { name: ["A tag with that name already exists."] },
    };
  }

  const baseSlug = slugifyTitle(input.name, "tag");
  let slug: string;
  if (input.slug) {
    const explicit = slugifyTitle(input.slug, "tag");
    if (await isSlugTaken(explicit)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
    slug = explicit;
  } else {
    slug = await uniqueSlug(baseSlug, (candidate) => isSlugTaken(candidate));
  }

  let createdId: string;
  try {
    const created = await prisma.tag.create({
      data: { name: input.name, slug },
      select: { id: true },
    });
    createdId = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
    logger.error("tag.create.failed", { code: prismaCode(error) });
    return {
      status: "error",
      message: "Could not create the tag. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("tag.created", { tagId: createdId });

  redirect(`/admin/tags/${createdId}/edit?notice=created`);
}

export async function updateTagAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  await requireWriteCapability("tags.manage");

  const parsed = updateTagSchema.safeParse({
    id: readField(formData, "id"),
    name: readField(formData, "name"),
    slug: readField(formData, "slug"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const existing = await prisma.tag.findUnique({
    where: { id: input.id },
    select: { id: true, slug: true },
  });
  if (!existing) {
    return { status: "error", message: "This tag no longer exists." };
  }

  if (await isNameTaken(input.name, existing.id)) {
    return {
      status: "error",
      fieldErrors: { name: ["A tag with that name already exists."] },
    };
  }

  const desiredSlug = input.slug
    ? slugifyTitle(input.slug, "tag")
    : existing.slug;
  if (
    desiredSlug !== existing.slug &&
    (await isSlugTaken(desiredSlug, existing.id))
  ) {
    return {
      status: "error",
      fieldErrors: { slug: ["That web address is already in use."] },
    };
  }

  try {
    await prisma.tag.update({
      where: { id: existing.id },
      data: { name: input.name, slug: desiredSlug },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
    logger.error("tag.update.failed", {
      tagId: existing.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not save the tag. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("tag.updated", { tagId: existing.id });

  redirect(`/admin/tags/${existing.id}/edit?notice=saved`);
}

export async function deleteTagAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  // A delete cannot be undone from the UI, so it takes the tighter budget.
  await requireWriteCapability("tags.manage", "sensitive");

  const id = readField(formData, "id");
  const confirmation = (readField(formData, "confirmation") ?? "").trim();
  if (!id) {
    return { status: "error", message: "Missing tag id." };
  }

  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!tag) {
    return { status: "error", message: "This tag no longer exists." };
  }
  if (confirmation !== tag.name) {
    return {
      status: "error",
      fieldErrors: {
        confirmation: ["Type the tag name exactly to confirm."],
      },
    };
  }

  try {
    // StoryTag rows cascade from the tag row.
    await prisma.tag.delete({ where: { id: tag.id } });
  } catch (error) {
    logger.error("tag.delete.failed", {
      tagId: tag.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not delete the tag. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("tag.deleted", { tagId: tag.id });

  redirect("/admin/tags?notice=deleted");
}
