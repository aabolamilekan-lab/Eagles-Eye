import { describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import { buildRelatedStoryWhere } from "@/lib/queries/public/story-filter";
import { parseContentSlug } from "@/lib/validation/story";

describe("buildRelatedStoryWhere", () => {
  it("always excludes the current story and applies the public predicate", () => {
    const where = buildRelatedStoryWhere({
      excludeStoryId: "story-1",
      categoryId: null,
      tagIds: [],
    });

    expect(where.status).toBe(ContentStatus.PUBLISHED);
    expect(where).not.toHaveProperty("chapters");
    expect(where.id).toEqual({ not: "story-1" });
    // No signals means an unfiltered (but still published-only) fallback, not
    // an `OR: []` that matches nothing.
    expect(where.OR).toBeUndefined();
  });

  it("uses category and tags as OR-ed signals", () => {
    const where = buildRelatedStoryWhere({
      excludeStoryId: "story-1",
      categoryId: "cat-1",
      tagIds: ["tag-a", "tag-b"],
    });

    expect(where.OR).toEqual([
      { categoryId: "cat-1" },
      { storyTags: { some: { tagId: { in: ["tag-a", "tag-b"] } } } },
    ]);
  });

  it("uses only tags when there is no category", () => {
    const where = buildRelatedStoryWhere({
      excludeStoryId: "story-1",
      categoryId: null,
      tagIds: ["tag-a"],
    });

    expect(where.OR).toEqual([
      { storyTags: { some: { tagId: { in: ["tag-a"] } } } },
    ]);
  });
});

describe("parseContentSlug", () => {
  it("accepts a lowercase hyphenated slug", () => {
    expect(parseContentSlug("the-cartographers-debt")).toBe(
      "the-cartographers-debt",
    );
  });

  it("trims and lowercases a provided slug", () => {
    expect(parseContentSlug("  Salt-And-Cedar ")).toBe("salt-and-cedar");
  });

  it("rejects empty, spaced, underscored and traversal-shaped input", () => {
    expect(parseContentSlug("")).toBeNull();
    expect(parseContentSlug("has spaces")).toBeNull();
    expect(parseContentSlug("has_underscore")).toBeNull();
    expect(parseContentSlug("../etc/passwd")).toBeNull();
    expect(parseContentSlug("trailing-")).toBeNull();
  });
});
