import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  COVER_MAX_EDGE,
  ImageProcessingError,
  isImageProcessingAvailable,
  parseCardRenditionRequest,
  processCoverImage,
  renderCardImage,
} from "@/lib/storage/images";

/**
 * sharp normalization.
 *
 * Every accepted upload is decoded and re-encoded to WebP, so the stored bytes
 * are guaranteed to be the format we claim and cannot carry an appended
 * payload. These tests use real sharp output and real decode failures.
 */
async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

describe("isImageProcessingAvailable", () => {
  it("reports the pipeline as available", async () => {
    expect(await isImageProcessingAvailable()).toBe(true);
  });
});

describe("processCoverImage", () => {
  it("re-encodes a PNG to WebP without upscaling", async () => {
    const processed = await processCoverImage(await png(64, 48));
    expect(processed.contentType).toBe("image/webp");
    expect(processed.width).toBe(64);
    expect(processed.height).toBe(48);
    expect(processed.buffer.byteLength).toBeGreaterThan(0);
    expect(processed.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("bounds a wide image to the maximum edge", async () => {
    const processed = await processCoverImage(await png(3000, 400));
    expect(processed.width).toBe(COVER_MAX_EDGE);
    expect(processed.height).toBeGreaterThan(0);
    expect(processed.height).toBeLessThanOrEqual(400);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(
      processCoverImage(Buffer.from("this is definitely not an image")),
    ).rejects.toBeInstanceOf(ImageProcessingError);
  });

  it("rejects an empty buffer", async () => {
    await expect(processCoverImage(Buffer.alloc(0))).rejects.toBeInstanceOf(
      ImageProcessingError,
    );
  });

  it("rejects an implausible aspect ratio", async () => {
    await expect(processCoverImage(await png(20, 1))).rejects.toMatchObject({
      code: "dimensions",
    });
  });
});

describe("parseCardRenditionRequest", () => {
  it("serves the stored cover untouched when no size is requested", () => {
    expect(parseCardRenditionRequest(new URLSearchParams())).toBe("original");
    expect(parseCardRenditionRequest(new URLSearchParams("utm_source=x"))).toBe(
      "original",
    );
  });

  it("accepts exactly the advertised card rendition", () => {
    expect(parseCardRenditionRequest(new URLSearchParams("w=1200&h=630"))).toBe(
      "card",
    );
  });

  it("rejects every other size request", () => {
    for (const query of [
      "w=800&h=630",
      "w=1200&h=631",
      "w=1200",
      "h=630",
      "w=1200&h=630&w=64",
      "w=abc&h=630",
    ]) {
      expect(parseCardRenditionRequest(new URLSearchParams(query))).toBe(
        "invalid",
      );
    }
  });
});

describe("renderCardImage", () => {
  it("crops any source to the exact advertised dimensions as JPEG", async () => {
    const card = await renderCardImage(await png(640, 480));
    expect(card.contentType).toBe("image/jpeg");
    expect(card.width).toBe(1200);
    expect(card.height).toBe(630);
    expect(card.buffer.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  });

  it("crops a portrait source without letterboxing", async () => {
    const card = await renderCardImage(await png(500, 2000));
    expect(card.width).toBe(1200);
    expect(card.height).toBe(630);
  });

  it("fails with a safe code on bytes that are not an image", async () => {
    await expect(
      renderCardImage(Buffer.from("not an image at all")),
    ).rejects.toBeInstanceOf(ImageProcessingError);
  });
});
