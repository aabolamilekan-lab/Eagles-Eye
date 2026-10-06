import { describe, expect, it } from "vitest";
import {
  CHAPTER_CONTENT_MAX,
  CHAPTER_TITLE_MAX,
  createChapterSchema,
  deleteChapterSchema,
  reorderChaptersSchema,
  updateChapterSchema,
} from "@/lib/validation/chapter";

describe("createChapterSchema", () => {
  it("trims the title and story id", () => {
    const parsed = createChapterSchema.parse({
      storyId: "  story-1  ",
      title: "  A Chapter  ",
    });
    expect(parsed.storyId).toBe("story-1");
    expect(parsed.title).toBe("A Chapter");
  });

  it("requires a title and a story id", () => {
    expect(createChapterSchema.safeParse({ storyId: "s", title: "   " }).success).toBe(
      false,
    );
    expect(createChapterSchema.safeParse({ title: "T" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = createChapterSchema.safeParse({
      storyId: "s",
      title: "T",
      status: "PUBLISHED",
    });
    expect(result.success).toBe(false);
  });

  it("caps the title length", () => {
    const result = createChapterSchema.safeParse({
      storyId: "s",
      title: "a".repeat(CHAPTER_TITLE_MAX + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("updateChapterSchema", () => {
  it("coerces a numeric position and defaults slug confirmation to false", () => {
    const parsed = updateChapterSchema.parse({
      storyId: "s",
      id: "c",
      title: "T",
      chapterNumber: "3",
    });
    expect(parsed.chapterNumber).toBe(3);
    expect(parsed.confirmSlugChange).toBe(false);
  });

  it("rejects a position below one", () => {
    const result = updateChapterSchema.safeParse({
      storyId: "s",
      id: "c",
      title: "T",
      chapterNumber: "0",
    });
    expect(result.success).toBe(false);
  });

  it("requires the chapter id", () => {
    const result = updateChapterSchema.safeParse({ storyId: "s", title: "T" });
    expect(result.success).toBe(false);
  });
});

describe("reorderChaptersSchema", () => {
  it("requires at least one id in the order", () => {
    expect(reorderChaptersSchema.safeParse({ storyId: "s", order: [] }).success).toBe(
      false,
    );
    expect(
      reorderChaptersSchema.safeParse({ storyId: "s", order: ["a", "b"] }).success,
    ).toBe(true);
  });
});

describe("deleteChapterSchema", () => {
  it("accepts an empty confirmation string for the action to reject", () => {
    const parsed = deleteChapterSchema.parse({
      storyId: "s",
      id: "c",
      confirmation: "",
    });
    expect(parsed.confirmation).toBe("");
  });
});

describe("content ceiling", () => {
  it("rejects content over the byte ceiling before sanitization", () => {
    const result = updateChapterSchema.safeParse({
      storyId: "s",
      id: "c",
      title: "T",
      content: "a".repeat(CHAPTER_CONTENT_MAX + 1),
    });
    expect(result.success).toBe(false);
  });
});
