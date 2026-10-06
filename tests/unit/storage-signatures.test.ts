import { describe, expect, it } from "vitest";
import {
  detectImageType,
  detectSignatureFamily,
  matchesDeclaredType,
} from "@/lib/storage/signatures";

/**
 * Magic-byte sniffing.
 *
 * The declared MIME type and extension are claims; these bytes are the
 * evidence. A container that merely starts with `RIFF` (AVI, WAV) must not be
 * treated as WebP.
 */
function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00);
const WEBP = bytes(
  0x52,
  0x49,
  0x46,
  0x46,
  0x24,
  0x00,
  0x00,
  0x00,
  0x57,
  0x45,
  0x42,
  0x50,
);
const AVI = bytes(
  0x52,
  0x49,
  0x46,
  0x46,
  0x24,
  0x00,
  0x00,
  0x00,
  0x41,
  0x56,
  0x49,
  0x20,
);

describe("detectImageType", () => {
  it("recognizes the three allowed formats", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });

  it("rejects a RIFF container whose sub-type is not WEBP", () => {
    expect(detectImageType(AVI)).toBeNull();
    expect(detectSignatureFamily(AVI)).toBe("riff-avi");
  });

  it("rejects empty and unknown buffers", () => {
    expect(detectImageType(new Uint8Array())).toBeNull();
    expect(detectSignatureFamily(new Uint8Array())).toBe("empty");
    expect(detectImageType(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(detectSignatureFamily(bytes(0x00, 0x01, 0x02, 0x03))).toBe("unknown");
  });

  it("rejects a truncated WebP header", () => {
    expect(detectImageType(WEBP.subarray(0, 10))).toBeNull();
  });
});

describe("matchesDeclaredType", () => {
  it("is true only when the bytes agree with the claim", () => {
    expect(matchesDeclaredType(PNG, "image/png")).toBe(true);
    expect(matchesDeclaredType(PNG, "image/jpeg")).toBe(false);
    expect(matchesDeclaredType(JPEG, "image/jpeg")).toBe(true);
    expect(matchesDeclaredType(WEBP, "image/webp")).toBe(true);
  });

  it("does not let an executable disguised by extension pass", () => {
    const withPngExtensionButNotPng = bytes(0x4d, 0x5a, 0x90, 0x00); // MZ header
    expect(matchesDeclaredType(withPngExtensionButNotPng, "image/png")).toBe(
      false,
    );
  });
});
