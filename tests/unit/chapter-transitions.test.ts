import { describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import {
  chapterStatusAfter,
  isChapterTransitionAllowed,
} from "@/lib/chapters/transitions";

const { DRAFT, PUBLISHED, ARCHIVED } = ContentStatus;

describe("chapter status transitions", () => {
  it("publishes a draft or a republished archive, but never an already-live chapter", () => {
    expect(isChapterTransitionAllowed(DRAFT, "publish")).toBe(true);
    expect(isChapterTransitionAllowed(ARCHIVED, "publish")).toBe(true);
    expect(isChapterTransitionAllowed(PUBLISHED, "publish")).toBe(false);
    expect(chapterStatusAfter(DRAFT, "publish")).toBe(PUBLISHED);
    expect(chapterStatusAfter(ARCHIVED, "publish")).toBe(PUBLISHED);
  });

  it("unpublishes only a published chapter back to draft", () => {
    expect(isChapterTransitionAllowed(PUBLISHED, "unpublish")).toBe(true);
    expect(isChapterTransitionAllowed(DRAFT, "unpublish")).toBe(false);
    expect(isChapterTransitionAllowed(ARCHIVED, "unpublish")).toBe(false);
    expect(chapterStatusAfter(PUBLISHED, "unpublish")).toBe(DRAFT);
  });

  it("archives a draft or a published chapter, never an archived one", () => {
    expect(isChapterTransitionAllowed(DRAFT, "archive")).toBe(true);
    expect(isChapterTransitionAllowed(PUBLISHED, "archive")).toBe(true);
    expect(isChapterTransitionAllowed(ARCHIVED, "archive")).toBe(false);
    expect(chapterStatusAfter(PUBLISHED, "archive")).toBe(ARCHIVED);
  });

  it("closes illegal transitions with a null destination", () => {
    expect(chapterStatusAfter(PUBLISHED, "publish")).toBeNull();
    expect(chapterStatusAfter(DRAFT, "unpublish")).toBeNull();
    expect(chapterStatusAfter(ARCHIVED, "archive")).toBeNull();
  });

  it("permits deletion from every status", () => {
    expect(isChapterTransitionAllowed(DRAFT, "delete")).toBe(true);
    expect(isChapterTransitionAllowed(PUBLISHED, "delete")).toBe(true);
    expect(isChapterTransitionAllowed(ARCHIVED, "delete")).toBe(true);
  });
});
