import { z } from "zod";
import { IMAGE_MIME_TYPES, type ImageMime } from "@/lib/storage/signatures";

/**
 * Upload metadata validation.
 *
 * Only three types are accepted, and the filename extension must agree with the
 * declared type through a fixed map (`jpg` and `jpeg` both mean JPEG). This is
 * the cheap, pre-byte gate; magic bytes and a sharp re-encode are the real
 * controls. The filename is never reused for storage.
 *
 * `.agent/skills/media-upload/SKILL.md`.
 */
export const UPLOAD_MIME_TYPES = IMAGE_MIME_TYPES;
export type UploadMime = ImageMime;

export const UPLOAD_MAX_FILENAME_LENGTH = 255;

const EXTENSION_BY_MIME: Record<ImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const MIME_BY_EXTENSION: Record<string, ImageMime> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** The extension the server will use for a validated type, never the client's. */
export function extensionForMime(mime: ImageMime): string {
  return EXTENSION_BY_MIME[mime];
}

/** Lowercased extension including the dot, or `""` when absent (or dotfile). */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return "";
  }
  return filename.slice(dot).toLowerCase();
}

export type MimeResolution =
  | { ok: true; mime: ImageMime }
  | { ok: false; reason: "mime" | "extension" };

/** Cross-check the declared MIME type against the filename extension. */
export function resolveDeclaredMime(
  declaredType: string,
  filename: string,
): MimeResolution {
  const mime = (UPLOAD_MIME_TYPES as readonly string[]).includes(declaredType)
    ? (declaredType as ImageMime)
    : null;
  if (!mime) {
    return { ok: false, reason: "mime" };
  }

  const extension = extensionOf(filename);
  if (!extension || MIME_BY_EXTENSION[extension] !== mime) {
    return { ok: false, reason: "extension" };
  }

  return { ok: true, mime };
}

/** True when the byte count is positive and at or under the ceiling. */
export function isWithinSizeLimit(bytes: number, maxBytes: number): boolean {
  return Number.isInteger(bytes) && bytes > 0 && bytes <= maxBytes;
}

/**
 * Zod view of the pre-byte metadata, used as an explicit validation surface and
 * in unit tests. The route still calls `resolveDeclaredMime` for typed reasons.
 */
export const uploadMetadataSchema = z
  .object({
    declaredType: z.string(),
    filename: z.string().min(1).max(UPLOAD_MAX_FILENAME_LENGTH),
  })
  .superRefine((value, ctx) => {
    const resolution = resolveDeclaredMime(value.declaredType, value.filename);
    if (!resolution.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: resolution.reason === "mime" ? ["declaredType"] : ["filename"],
        message:
          resolution.reason === "mime"
            ? "Only JPEG, PNG and WebP images are accepted."
            : "The file extension does not match the image type.",
      });
    }
  });
