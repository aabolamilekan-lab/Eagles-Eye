"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireWriteCapability } from "@/lib/auth/guards";
import { toggleNewsSourceSchema } from "@/lib/validation/news-sources";

export interface SourceActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  sourceId?: string;
  isActive?: boolean;
}

function parseFormDataValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Toggle active status for a news source.
 * Enforces server-side authorization and validates source eligibility before activating.
 */
export async function toggleNewsSourceAction(
  formData: FormData,
): Promise<SourceActionResult> {
  // 1. Server-side authorization check (write capability + rate budget)
  await requireWriteCapability("settings.manage", "normal");

  // 2. Validate form input
  const parsed = toggleNewsSourceSchema.safeParse({
    sourceId: parseFormDataValue(formData, "sourceId"),
    active: parseFormDataValue(formData, "active"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input parameters for news source.",
    };
  }

  const { sourceId, active } = parsed.data;

  try {
    const source = await prisma.newsSource.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        name: true,
        feedUrl: true,
        attributionPolicy: true,
        isActive: true,
      },
    });

    if (!source) {
      return {
        ok: false,
        error: "News source could not be found.",
      };
    }

    // 3. Preflight validation when activating a source
    if (active) {
      if (!source.feedUrl || !/^https?:\/\//i.test(source.feedUrl)) {
        return {
          ok: false,
          error: "Cannot activate a source without a valid HTTP(S) feed URL.",
        };
      }

      if (!source.attributionPolicy) {
        return {
          ok: false,
          error: "Cannot activate a source without a defined attribution policy.",
        };
      }
    }

    // 4. Update status in database
    await prisma.newsSource.update({
      where: { id: sourceId },
      data: { isActive: active },
    });

    // 5. Invalidate relevant admin caches
    revalidatePath("/admin/news/sources");
    revalidatePath("/admin/news/sync");

    return {
      ok: true,
      sourceId,
      isActive: active,
      message: `Source "${source.name}" successfully ${active ? "activated" : "deactivated"}.`,
    };
  } catch (_err) {
    return {
      ok: false,
      error: "An unexpected error occurred while updating the source status.",
    };
  }
}
