import { getSession } from "@/lib/auth/guards";
import { hasCapability } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCoverObject, isCoverKey } from "@/lib/storage/covers";
import { StorageConfigError } from "@/lib/storage/config";
import { StorageError, type StoredObject } from "@/lib/storage/types";

/**
 * Cover image delivery.
 *
 * Covers live outside `public/`; this route is the only door to them. A key is
 * served only when a story references it AND either that story is publicly
 * visible (PUBLISHED with at least one PUBLISHED chapter) or the requester is
 * an authorized admin previewing a draft. Everything else — unknown key,
 * unpublished draft to an anonymous reader, storage failure — returns the same
 * `404`, so the route cannot be used to enumerate drafts.
 *
 * AGENTS.md sections 6, 8, 11. `.agent/skills/media-upload/SKILL.md`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await context.params;
  const key = segments.join("/");

  if (!isCoverKey(key)) {
    return notFound();
  }

  const story = await prisma.story.findFirst({
    where: { coverImage: key },
    select: {
      status: true,
      chapters: {
        where: { status: "PUBLISHED" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!story) {
    return notFound();
  }

  const isPublic = story.status === "PUBLISHED" && story.chapters.length > 0;

  if (!isPublic) {
    const session = await getSession();
    if (!session || !hasCapability(session.role, "stories.manage")) {
      return notFound();
    }
  }

  let object: StoredObject | null;
  try {
    object = await getCoverObject(key);
  } catch (error) {
    if (error instanceof StorageConfigError) {
      return notFound();
    }
    if (error instanceof StorageError) {
      logger.error("image.read_failed");
      return notFound();
    }
    logger.error("image.read_failed");
    return notFound();
  }

  if (!object) {
    return notFound();
  }

  const body = new Uint8Array(object.body);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": object.contentType,
      "content-length": String(body.byteLength),
      "cache-control": isPublic
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
