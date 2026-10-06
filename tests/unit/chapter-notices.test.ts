import { describe, expect, it } from "vitest";
import { resolveChapterNotice } from "@/lib/chapters/notices";

describe("resolveChapterNotice", () => {
  it("maps known keys to safe alerts", () => {
    expect(resolveChapterNotice("created")?.tone).toBe("success");
    expect(resolveChapterNotice("deleted-empty")?.tone).toBe("warning");
    expect(resolveChapterNotice("archived")?.tone).toBe("warning");
    expect(resolveChapterNotice("reordered")?.title).toMatch(/order/i);
  });

  it("ignores an unknown key rather than reflecting it", () => {
    expect(resolveChapterNotice("<script>alert(1)</script>")).toBeNull();
    expect(resolveChapterNotice("made-up")).toBeNull();
  });

  it("reads the first value of a repeated query parameter", () => {
    expect(resolveChapterNotice(["published", "other"])?.title).toBe(
      "Chapter published",
    );
  });

  it("returns null for a non-string value", () => {
    expect(resolveChapterNotice(undefined)).toBeNull();
    expect(resolveChapterNotice(42)).toBeNull();
  });
});
