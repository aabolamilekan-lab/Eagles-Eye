import { describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import {
  canFeature,
  isStatusTransitionAllowed,
  statusAfter,
} from "@/lib/stories/transitions";

const { DRAFT, PUBLISHED, ARCHIVED } = ContentStatus;

describe("story status transitions", () => {
  it("allows publishing only a draft", () => {
    expect(isStatusTransitionAllowed(DRAFT, "publish")).toBe(true);
    expect(isStatusTransitionAllowed(PUBLISHED, "publish")).toBe(false);
    expect(isStatusTransitionAllowed(ARCHIVED, "publish")).toBe(false);
    expect(statusAfter(DRAFT, "publish")).toBe(PUBLISHED);
  });

  it("unpublishes a published story back to draft", () => {
    expect(isStatusTransitionAllowed(PUBLISHED, "unpublish")).toBe(true);
    expect(isStatusTransitionAllowed(DRAFT, "unpublish")).toBe(false);
    expect(statusAfter(PUBLISHED, "unpublish")).toBe(DRAFT);
  });

  it("archives only a published story", () => {
    expect(isStatusTransitionAllowed(PUBLISHED, "archive")).toBe(true);
    expect(isStatusTransitionAllowed(DRAFT, "archive")).toBe(false);
    expect(isStatusTransitionAllowed(ARCHIVED, "archive")).toBe(false);
    expect(statusAfter(PUBLISHED, "archive")).toBe(ARCHIVED);
  });

  it("restores an archived story to draft", () => {
    expect(isStatusTransitionAllowed(ARCHIVED, "restore")).toBe(true);
    expect(isStatusTransitionAllowed(DRAFT, "restore")).toBe(false);
    expect(statusAfter(ARCHIVED, "restore")).toBe(DRAFT);
  });

  it("closes illegal transitions with a null destination", () => {
    expect(statusAfter(PUBLISHED, "publish")).toBeNull();
    expect(statusAfter(DRAFT, "unpublish")).toBeNull();
  });

  it("permits deletion from every status", () => {
    expect(isStatusTransitionAllowed(DRAFT, "delete")).toBe(true);
    expect(isStatusTransitionAllowed(PUBLISHED, "delete")).toBe(true);
    expect(isStatusTransitionAllowed(ARCHIVED, "delete")).toBe(true);
  });

  it("allows featuring only a published story", () => {
    expect(canFeature(PUBLISHED)).toBe(true);
    expect(canFeature(DRAFT)).toBe(false);
    expect(canFeature(ARCHIVED)).toBe(false);
  });
});
