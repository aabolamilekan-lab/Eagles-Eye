import { describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import {
  buildStoryListWhere,
  escapeLikeTerm,
  PUBLIC_STORY_WHERE,
} from "@/lib/queries/public/story-filter";

describe("escapeLikeTerm", () => {
  it("escapes LIKE wildcards and the escape character itself", () => {
    expect(escapeLikeTerm("50%")).toBe("50\\%");
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
    expect(escapeLikeTerm("a\\b")).toBe("a\\\\b");
    expect(escapeLikeTerm("plain")).toBe("plain");
  });
});

describe("buildStoryListWhere", () => {
  const empty = { q: "", category: null, tags: [] };

  it("always applies the published-story visibility predicate", () => {
    const where = buildStoryListWhere(empty);
    expect(where.status).toBe(ContentStatus.PUBLISHED);
    expect(where.chapters).toEqual({
      some: { status: ContentStatus.PUBLISHED },
    });
    expect(where.OR).toBeUndefined();
    expect(where.AND).toBeUndefined();
    expect(where.category).toBeUndefined();
  });

  it("shares one visibility predicate with the rest of the reader queries", () => {
    expect(PUBLIC_STORY_WHERE.status).toBe(ContentStatus.PUBLISHED);
  });

  it("searches title, author and description with escaped wildcards", () => {
    const where = buildStoryListWhere({ ...empty, q: "50%" });
    expect(where.OR).toEqual([
      { title: { contains: "50\\%", mode: "insensitive" } },
      { shortDescription: { contains: "50\\%", mode: "insensitive" } },
      { author: { contains: "50\\%", mode: "insensitive" } },
    ]);
  });

  it("filters by category slug", () => {
    const where = buildStoryListWhere({ ...empty, category: "fantasy" });
    expect(where.category).toEqual({ slug: "fantasy" });
  });

  it("combines multiple tags with AND semantics", () => {
    const where = buildStoryListWhere({
      ...empty,
      tags: ["epic", "magic"],
    });
    expect(where.AND).toEqual([
      { storyTags: { some: { tag: { slug: "epic" } } } },
      { storyTags: { some: { tag: { slug: "magic" } } } },
    ]);
  });
});
