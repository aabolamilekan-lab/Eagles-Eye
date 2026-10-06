/**
 * Magic-byte image sniffing.
 *
 * The declared MIME type and the filename are claims; these bytes are the
 * evidence. Detection is positive and exact: a buffer that does not match a
 * known signature is not an image, regardless of what the request said. Pure
 * and dependency-free so it is exhaustively unit-testable.
 *
 * `.agent/skills/media-upload/SKILL.md`.
 */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50] as const; // "WEBP"

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * A short, safe label for logs. Never echoes bytes or the filename.
 */
export type SignatureFamily =
  | "jpeg"
  | "png"
  | "webp"
  | "riff-avi"
  | "riff-wav"
  | "riff-other"
  | "empty"
  | "unknown";

export function detectSignatureFamily(bytes: Uint8Array): SignatureFamily {
  if (bytes.length === 0) {
    return "empty";
  }
  if (startsWith(bytes, JPEG)) {
    return "jpeg";
  }
  if (startsWith(bytes, PNG)) {
    return "png";
  }
  if (startsWith(bytes, RIFF) && bytes.length >= 12) {
    if (startsWith(bytes.subarray(8), WEBP)) {
      return "webp";
    }
    if (startsWith(bytes.subarray(8), [0x41, 0x56, 0x49, 0x20])) {
      return "riff-avi";
    }
    if (startsWith(bytes.subarray(8), [0x57, 0x41, 0x56, 0x45])) {
      return "riff-wav";
    }
    return "riff-other";
  }
  return "unknown";
}

/**
 * The MIME type the bytes actually are, or `null`.
 *
 * A `RIFF` container whose sub-type is not `WEBP` (for example an AVI or WAV
 * file) is not WebP and returns `null`.
 */
export function detectImageType(bytes: Uint8Array): ImageMime | null {
  switch (detectSignatureFamily(bytes)) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

/** Does the buffer's real type equal the declared type? */
export function matchesDeclaredType(
  bytes: Uint8Array,
  declared: ImageMime,
): boolean {
  return detectImageType(bytes) === declared;
}
