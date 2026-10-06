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
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validation/taxonomy";

/**
 * Category mutations.
 *
 * Every action re-checks the `categories.manage` capability at call time (the
 * layout guard is not a substitute), validates before touching the database,
 * and returns a safe typed result instead of leaking a Prisma error. Names are
 * compared case-insensitively so two categories cannot differ only by case; the
 * unique slug constraint backstops a concurrent create. A category that still
 * holds stories is never deleted — the relation is `Restrict`, and the action
 * refuses with a clear message rather than surfacing a foreign-key error
 * (AGENTS.md sections 8, 9, 13 and 14).
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

/** Case-insensitive name match, excluding `excludeId` when editing. */
async function isNameTaken(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.category.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      id: excludeId ? { not: excludeId } : undefined,
    },
    select: { id: true },
  });
  return existing !== null;
}

async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null && existing.id !== excludeId;
}

export async function createCategoryAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  await requireWriteCapability("categories.manage");

  const parsed = createCategorySchema.safeParse({
    name: readField(formData, "name"),
    slug: readField(formData, "slug"),
    description: readField(formData, "description"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  if (await isNameTaken(input.name)) {
    return {
      status: "error",
      fieldErrors: { name: ["A category with that name already exists."] },
    };
  }

  const baseSlug = slugifyTitle(input.name, "category");
  let slug: string;
  if (input.slug) {
    const explicit = slugifyTitle(input.slug, "category");
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
    const created = await prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description || null,
      },
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
    logger.error("category.create.failed", { code: prismaCode(error) });
    return {
      status: "error",
      message: "Could not create the category. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("category.created", { categoryId: createdId });

  redirect(`/admin/categories/${createdId}/edit?notice=created`);
}

export async function updateCategoryAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  await requireWriteCapability("categories.manage");

  const parsed = updateCategorySchema.safeParse({
    id: readField(formData, "id"),
    name: readField(formData, "name"),
    slug: readField(formData, "slug"),
    description: readField(formData, "description"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }
  const input = parsed.data;

  const existing = await prisma.category.findUnique({
    where: { id: input.id },
    select: { id: true, slug: true },
  });
  if (!existing) {
    return { status: "error", message: "This category no longer exists." };
  }

  if (await isNameTaken(input.name, existing.id)) {
    return {
      status: "error",
      fieldErrors: { name: ["A category with that name already exists."] },
    };
  }

  const desiredSlug = input.slug
    ? slugifyTitle(input.slug, "category")
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
    await prisma.category.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        slug: desiredSlug,
        description: input.description || null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { slug: ["That web address is already in use."] },
      };
    }
    logger.error("category.update.failed", {
      categoryId: existing.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not save the category. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("category.updated", { categoryId: existing.id });

  redirect(`/admin/categories/${existing.id}/edit?notice=saved`);
}

export async function deleteCategoryAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  // A delete cannot be undone from the UI, so it takes the tighter budget.
  await requireWriteCapability("categories.manage", "sensitive");

  const id = readField(formData, "id");
  const confirmation = (readField(formData, "confirmation") ?? "").trim();
  if (!id) {
    return { status: "error", message: "Missing category id." };
  }

  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { stories: true } } },
  });
  if (!category) {
    return { status: "error", message: "This category no longer exists." };
  }
  if (confirmation !== category.name) {
    return {
      status: "error",
      fieldErrors: {
        confirmation: ["Type the category name exactly to confirm."],
      },
    };
  }

  if (category._count.stories > 0) {
    const count = category._count.stories;
    return {
      status: "error",
      message: `This category still holds ${count} ${
        count === 1 ? "story" : "stories"
      }. Move or delete ${
        count === 1 ? "it" : "them"
      } before deleting the category.`,
    };
  }

  try {
    await prisma.category.delete({ where: { id: category.id } });
  } catch (error) {
    // The FK is `Restrict`, so a concurrent story assignment surfaces here.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        status: "error",
        message:
          "This category now holds a story and cannot be deleted. Refresh and try again.",
      };
    }
    logger.error("category.delete.failed", {
      categoryId: category.id,
      code: prismaCode(error),
    });
    return {
      status: "error",
      message: "Could not delete the category. Please try again.",
    };
  }

  revalidatePublicStoryCaches();
  logger.info("category.deleted", { categoryId: category.id });

  redirect("/admin/categories?notice=deleted");
}
