import { getSession } from "@/lib/auth/guards";
import { hasCapability } from "@/lib/auth/permissions";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIpFromRequest, getUploadLimiter } from "@/lib/rate-limit/upload";
import { putCover } from "@/lib/storage/covers";
import { StorageConfigError } from "@/lib/storage/config";
import {
  ImageProcessingError,
  processCoverImage,
  type ProcessedCover,
} from "@/lib/storage/images";
import {
  detectImageType,
  detectSignatureFamily,
  matchesDeclaredType,
  type ImageMime,
} from "@/lib/storage/signatures";
import { StorageError } from "@/lib/storage/types";
import { resolveDeclaredMime } from "@/lib/validation/upload";

/**
 * Admin cover upload.
 *
 * This is the one write path for cover objects. It is deliberately paranoid:
 * session and capability are re-checked here (a layout guard is not access
 * control), the request origin must match the app, the body is read with a hard
 * ceiling, the declared type must agree with the extension, the magic bytes
 * must agree with both, and sharp re-encodes the result to WebP before it is
 * stored. The client is told a key, never a bucket, path or credential.
 *
 * AGENTS.md sections 7, 9, 11, 13. `.agent/skills/media-upload/SKILL.md`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Multipart framing (boundaries, part headers) on top of the file ceiling. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

type ErrorCode =
  | "forbidden"
  | "unauthorized"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media_type"
  | "invalid_request"
  | "invalid_image"
  | "unavailable"
  | "storage_error";

function json(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function failure(status: number, code: ErrorCode, message: string, headers?: Record<string, string>) {
  return json(status, { ok: false, code, error: message }, headers);
}

function normalizeOrigin(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.origin;
  } catch {
    const trimmed = urlStr.trim().replace(/\/+$/, "");
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed;
    }
  }
}

function originIsAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return normalizeOrigin(origin) === normalizeOrigin(getEnv().NEXT_PUBLIC_APP_URL);
  } catch {
    return false;
  }
}

type BoundedRead = { ok: true; buffer: Buffer } | { ok: false };

async function readBoundedBody(request: Request, limit: number): Promise<BoundedRead> {
  const stream = request.body;
  if (!stream) {
    return { ok: true, buffer: Buffer.alloc(0) };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          return { ok: false };
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { ok: true, buffer: Buffer.concat(chunks) };
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return failure(415, "unsupported_media_type", "Upload must be multipart form data.");
  }

  if (!originIsAllowed(request)) {
    return failure(403, "forbidden", "Request origin is not allowed.");
  }

  const session = await getSession();
  if (!session) {
    return failure(401, "unauthorized", "Sign in to upload images.");
  }
  if (!hasCapability(session.role, "stories.manage")) {
    return failure(403, "forbidden", "You do not have permission to upload images.");
  }

  const env = getEnv();
  const ip = clientIpFromRequest(request);
  const limit = getUploadLimiter().check(`${session.userId}:${ip}`);
  if (!limit.allowed) {
    return failure(429, "rate_limited", "Too many uploads. Try again shortly.", {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

  const maxBytes = env.UPLOAD_MAX_BYTES;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    return failure(413, "payload_too_large", "The image is larger than the allowed size.");
  }

  const body = await readBoundedBody(request, maxBytes + MULTIPART_OVERHEAD_BYTES);
  if (!body.ok) {
    return failure(413, "payload_too_large", "The image is larger than the allowed size.");
  }

  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body.buffer), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return failure(400, "invalid_request", "The upload could not be read.");
  }

  const entry = form.get("file");
  if (!(entry instanceof Blob)) {
    return failure(400, "invalid_request", "No file was included in the upload.");
  }

  const filename = entry instanceof File ? entry.name : "";
  const resolution = resolveDeclaredMime(entry.type, filename);
  if (!resolution.ok) {
    return failure(
      415,
      "unsupported_media_type",
      resolution.reason === "mime"
        ? "Only JPEG, PNG and WebP images are accepted."
        : "The file extension does not match the image type.",
    );
  }
  const declaredMime: ImageMime = resolution.mime;

  if (entry.size > maxBytes) {
    return failure(413, "payload_too_large", "The image is larger than the allowed size.");
  }

  const bytes = Buffer.from(await entry.arrayBuffer());
  if (bytes.byteLength === 0) {
    return failure(400, "invalid_request", "The uploaded file is empty.");
  }
  if (bytes.byteLength > maxBytes) {
    return failure(413, "payload_too_large", "The image is larger than the allowed size.");
  }
  if (!matchesDeclaredType(bytes, declaredMime)) {
    logger.warn("upload.rejected", {
      reason: "signature_mismatch",
      declared: declaredMime,
      detected: detectSignatureFamily(bytes),
      bytes: bytes.byteLength,
    });
    return failure(415, "unsupported_media_type", "The file is not a valid image of its declared type.");
  }

  let processed: ProcessedCover;
  try {
    processed = await processCoverImage(bytes);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      logger.warn("upload.rejected", { reason: error.code });
      if (error.code === "unavailable") {
        return failure(503, "unavailable", "Image processing is temporarily unavailable.");
      }
      return failure(422, "invalid_image", error.message);
    }
    logger.error("upload.process_failed");
    return failure(500, "invalid_image", "The image could not be processed.");
  }

  let key: string;
  try {
    key = await putCover(processed.buffer);
  } catch (error) {
    if (error instanceof StorageConfigError) {
      logger.error("upload.storage_unconfigured");
      return failure(503, "unavailable", "Image storage is not configured.");
    }
    if (error instanceof StorageError) {
      logger.error("upload.storage_write_failed", { source: detectImageType(bytes) });
      return failure(502, "storage_error", "The image could not be saved. Try again.");
    }
    logger.error("upload.storage_write_failed");
    return failure(502, "storage_error", "The image could not be saved. Try again.");
  }

  // The object now exists. If the response cannot be delivered the object is
  // orphaned until the sweep runs; that is preferable to failing a stored file.
  logger.info("upload.stored", {
    width: processed.width,
    height: processed.height,
    bytes: processed.buffer.byteLength,
  });

  return json(200, {
    ok: true,
    key,
    width: processed.width,
    height: processed.height,
  });
}
