import { describe, expect, it } from "vitest";
import {
  extensionForMime,
  extensionOf,
  isWithinSizeLimit,
  resolveDeclaredMime,
  uploadMetadataSchema,
  UPLOAD_MIME_TYPES,
} from "@/lib/validation/upload";

/**
 * Upload metadata validation.
 *
 * The declared type must be on the allowlist AND agree with the filename
 * extension through a fixed map. `jpeg` is the only alias. This is the cheap
 * pre-byte gate; magic bytes and a sharp re-encode are the real controls.
 */
describe("resolveDeclaredMime", () => {
  it("accepts an allowed type whose extension matches", () => {
    expect(resolveDeclaredMime("image/jpeg", "photo.jpg")).toEqual({
      ok: true,
      mime: "image/jpeg",
    });
    expect(resolveDeclaredMime("image/jpeg", "photo.JPEG")).toEqual({
      ok: true,
      mime: "image/jpeg",
    });
    expect(resolveDeclaredMime("image/png", "cover.png")).toEqual({
      ok: true,
      mime: "image/png",
    });
    expect(resolveDeclaredMime("image/webp", "cover.webp")).toEqual({
      ok: true,
      mime: "image/webp",
    });
  });

  it("rejects a type that is not on the allowlist", () => {
    expect(resolveDeclaredMime("image/gif", "x.gif")).toEqual({
      ok: false,
      reason: "mime",
    });
    expect(resolveDeclaredMime("image/svg+xml", "x.svg")).toEqual({
      ok: false,
      reason: "mime",
    });
    expect(resolveDeclaredMime("application/octet-stream", "x.png")).toEqual({
      ok: false,
      reason: "mime",
    });
  });

  it("rejects an extension that disagrees with the type", () => {
    expect(resolveDeclaredMime("image/png", "cover.jpg")).toEqual({
      ok: false,
      reason: "extension",
    });
    expect(resolveDeclaredMime("image/jpeg", "cover.webp")).toEqual({
      ok: false,
      reason: "extension",
    });
  });

  it("rejects a missing or empty extension", () => {
    expect(resolveDeclaredMime("image/png", "cover")).toEqual({
      ok: false,
      reason: "extension",
    });
    expect(resolveDeclaredMime("image/png", "cover.")).toEqual({
      ok: false,
      reason: "extension",
    });
    expect(resolveDeclaredMime("image/png", ".png")).toEqual({
      ok: false,
      reason: "extension",
    });
  });
});

describe("extensionOf", () => {
  it("lowercases the extension and handles edge cases", () => {
    expect(extensionOf("Photo.JPG")).toBe(".jpg");
    expect(extensionOf("a.b.png")).toBe(".png");
    expect(extensionOf("noextension")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("extensionForMime", () => {
  it("maps each allowed type to a normalized extension", () => {
    expect(extensionForMime("image/jpeg")).toBe(".jpg");
    expect(extensionForMime("image/png")).toBe(".png");
    expect(extensionForMime("image/webp")).toBe(".webp");
  });
});

describe("isWithinSizeLimit", () => {
  it("requires a positive integer at or under the ceiling", () => {
    expect(isWithinSizeLimit(1, 10)).toBe(true);
    expect(isWithinSizeLimit(10, 10)).toBe(true);
    expect(isWithinSizeLimit(0, 10)).toBe(false);
    expect(isWithinSizeLimit(-1, 10)).toBe(false);
    expect(isWithinSizeLimit(11, 10)).toBe(false);
    expect(isWithinSizeLimit(1.5, 10)).toBe(false);
  });
});

describe("uploadMetadataSchema", () => {
  it("accepts a matching type and extension", () => {
    expect(
      uploadMetadataSchema.safeParse({
        declaredType: "image/png",
        filename: "cover.png",
      }).success,
    ).toBe(true);
  });

  it("flags the mismatching field", () => {
    const result = uploadMetadataSchema.safeParse({
      declaredType: "image/png",
      filename: "cover.jpg",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["filename"]);
    }
  });

  it("exposes exactly the three allowed types", () => {
    expect([...UPLOAD_MIME_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});
