import sharp from "sharp";

/**
 * Image fixtures for the upload journey.
 *
 * Cover files are generated rather than committed: a real JPEG/PNG/WebP keeps
 * the signature, dimension and re-encode checks on the server honest, and
 * generating them avoids a binary blob in the repository.
 */
export interface ImageFixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A valid PNG of the given size, so the server's dimension checks pass. */
export async function coverPng(
  width = 1200,
  height = 800,
  name = "cover.png",
): Promise<ImageFixture> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 32, g: 58, b: 92 },
    },
  })
    .png()
    .toBuffer();

  return { name, mimeType: "image/png", buffer };
}

/**
 * A file whose bytes are not an image at all.
 *
 * Used to prove the server rejects a renamed text file rather than trusting the
 * declared MIME type or the extension.
 */
export function notAnImage(
  name = "payload.png",
  mimeType = "image/png",
): ImageFixture {
  return {
    name,
    mimeType,
    buffer: Buffer.from(
      "This is plain text pretending to be a PNG. If this is stored, the signature check is broken.\n",
      "utf8",
    ),
  };
}

/** A well-formed SVG, which the allowlist does not include. */
export function svgDisguisedAsPng(name = "vector.png"): ImageFixture {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><script>alert(1)</script><rect width="120" height="120"/></svg>',
      "utf8",
    ),
  };
}

/** Larger than the configured upload ceiling, so the size check refuses it. */
export function oversized(name = "huge.png", maxBytes = 5 * 1024 * 1024): ImageFixture {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.alloc(maxBytes + 1024, 0x41),
  };
}
