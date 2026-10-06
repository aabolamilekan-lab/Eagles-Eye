import { describe, expect, it } from "vitest";
import { COVER_KEY_PATTERN } from "@/lib/storage/cover-key";
import { buildCoverKey, isCoverKey } from "@/lib/storage/covers";
import {
  assertSafeStorageKey,
  isSafeStorageKey,
  MAX_STORAGE_KEY_LENGTH,
} from "@/lib/storage/keys";

/**
 * Storage key safety and cover key shape.
 *
 * Keys are server-generated but echoed back from the client, so every read and
 * write validates them. Traversal, separators we do not use and control
 * characters are refused before a driver ever sees the string.
 */
describe("buildCoverKey", () => {
  it("produces the documented shape", () => {
    const key = buildCoverKey(new Date(Date.UTC(2026, 9, 3)));
    expect(key).toMatch(COVER_KEY_PATTERN);
    expect(key.startsWith("covers/2026/10/")).toBe(true);
    expect(isCoverKey(key)).toBe(true);
  });

  it("is unique per call", () => {
    const first = buildCoverKey();
    const second = buildCoverKey();
    expect(first).not.toBe(second);
  });
});

describe("isCoverKey", () => {
  it("accepts a generated key", () => {
    expect(isCoverKey(buildCoverKey())).toBe(true);
  });

  it("rejects traversal, absolute paths and wrong extensions", () => {
    expect(isCoverKey("covers/2026/10/../../../etc/passwd")).toBe(false);
    expect(isCoverKey("/covers/2026/10/00000000-0000-0000-0000-000000000000.webp")).toBe(
      false,
    );
    expect(
      isCoverKey("covers/2026/10/00000000-0000-0000-0000-000000000000.jpg"),
    ).toBe(false);
    expect(isCoverKey("covers/2026/10/not-a-uuid.webp")).toBe(false);
    expect(isCoverKey("https://cdn.example.com/cover.webp")).toBe(false);
    expect(isCoverKey("")).toBe(false);
  });
});

describe("storage key safety", () => {
  it("accepts a normal nested key", () => {
    expect(isSafeStorageKey("covers/2026/10/file.webp")).toBe(true);
  });

  it("rejects traversal and unsafe separators", () => {
    expect(isSafeStorageKey("../secret")).toBe(false);
    expect(isSafeStorageKey("a/../../b")).toBe(false);
    expect(isSafeStorageKey("a//b")).toBe(false);
    expect(isSafeStorageKey("/absolute")).toBe(false);
    expect(isSafeStorageKey("back\\slash")).toBe(false);
    expect(isSafeStorageKey("trailing/")).toBe(false);
    expect(isSafeStorageKey("")).toBe(false);
  });

  it("rejects control characters", () => {
    expect(isSafeStorageKey("a\u0000b")).toBe(false);
    expect(isSafeStorageKey("a\nb")).toBe(false);
  });

  it("rejects oversized keys", () => {
    expect(isSafeStorageKey("a".repeat(MAX_STORAGE_KEY_LENGTH + 1))).toBe(false);
  });

  it("throws a TypeError from the asserting form", () => {
    expect(() => assertSafeStorageKey("../x")).toThrow(TypeError);
    expect(() => assertSafeStorageKey("ok/key.webp")).not.toThrow();
  });
});
