/**
 * Server-side image normalization.
 *
 * Every accepted upload is decoded and re-encoded by sharp before storage.
 * Re-encoding drops embedded payloads (appended archives, polyglot tricks,
 * EXIF blobs) and guarantees the stored object really is the format we claim.
 * Dimensions are checked before and after, and the output is bounded.
 *
 * sharp is loaded lazily so a missing native binary degrades to a typed
 * "unavailable" error instead of crashing module evaluation, and so this stays
 * out of any client bundle. `.agent/skills/media-upload/SKILL.md`.
 */
export type ImageProcessingFailure = "unavailable" | "decode" | "dimensions";

const FAILURE_MESSAGES: Record<ImageProcessingFailure, string> = {
  unavailable: "Image processing is unavailable.",
  decode: "The file could not be read as an image.",
  dimensions: "The image dimensions are not supported.",
};

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingFailure;

  constructor(code: ImageProcessingFailure) {
    super(FAILURE_MESSAGES[code]);
    this.name = "ImageProcessingError";
    this.code = code;
  }
}

/** Refuse decode of anything larger than this many total pixels. */
export const MAX_INPUT_PIXELS = 40_000_000;
/** Refuse absurd single edges even if total pixels are within budget. */
export const MAX_INPUT_EDGE = 8_192;
/** Refuse extreme slivers (aspect ratio beyond this). */
export const MAX_ASPECT_RATIO = 10;
/** Longest edge of the stored cover; smaller images are not upscaled. */
export const COVER_MAX_EDGE = 2_560;
export const COVER_WEBP_QUALITY = 82;

export interface ProcessedCover {
  buffer: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
}

function isPlausibleDimensions(
  width: number | undefined,
  height: number | undefined,
): width is number {
  if (typeof width !== "number" || typeof height !== "number") {
    return false;
  }
  if (width < 1 || height < 1) {
    return false;
  }
  if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE) {
    return false;
  }
  if (width * height > MAX_INPUT_PIXELS) {
    return false;
  }
  const ratio = Math.max(width / height, height / width);
  return Number.isFinite(ratio) && ratio <= MAX_ASPECT_RATIO;
}

let sharpLoader: Promise<typeof import("sharp")> | null = null;

function loadSharp(): Promise<typeof import("sharp")> {
  sharpLoader ??= import("sharp");
  return sharpLoader;
}

/** Whether the native image pipeline is usable in this deployment. */
export async function isImageProcessingAvailable(): Promise<boolean> {
  try {
    await loadSharp();
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode, orient, bound and re-encode a cover to WebP.
 *
 * Throws `ImageProcessingError` with a safe code. Never includes the buffer,
 * the filename or provider detail.
 */
export async function processCoverImage(input: Buffer): Promise<ProcessedCover> {
  let sharp: typeof import("sharp");
  try {
    sharp = await loadSharp();
  } catch {
    throw new ImageProcessingError("unavailable");
  }

  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" } as const;

  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp.default(input, options).metadata();
    width = metadata.width;
    height = metadata.height;
  } catch {
    throw new ImageProcessingError("decode");
  }

  if (!isPlausibleDimensions(width, height)) {
    throw new ImageProcessingError("dimensions");
  }

  try {
    const { data, info } = await sharp
      .default(input, options)
      .rotate()
      .resize({
        width: COVER_MAX_EDGE,
        height: COVER_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: COVER_WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new ImageProcessingError("decode");
  }
}
