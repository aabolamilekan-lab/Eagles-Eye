import { describe, expect, it } from "vitest";
import { ContentStatus } from "@prisma/client";
import {
  buildStorySearchWhere,
  PUBLIC_STORY_WHERE,
} from "@/lib/queries/public/story-filter";

describe("buildStorySearchWhere", () => {
  const empty = { q: "", category: null, tags: [] };

  it("always applies the shared published-story visibility predicate", () => {
    const where = buildStorySearchWhere(empty);
    expect(where.status).toBe(ContentStatus.PUBLISHED);
    expect(where).not.toHaveProperty("chapters");
    expect(where.OR).toBeUndefined();
    expect(where.AND).toBeUndefined();
    expect(where.category).toBeUndefined();
    expect(PUBLIC_STORY_WHERE.status).toBe(ContentStatus.PUBLISHED);
    expect(PUBLIC_STORY_WHERE).not.toHaveProperty("chapters");
  });

  it("matches the term across the story's own text, its category and its tags", () => {
    const where = buildStorySearchWhere({ ...empty, q: "lighthouse" });
    expect(where.OR).toEqual([
      { title: { contains: "lighthouse", mode: "insensitive" } },
      { author: { contains: "lighthouse", mode: "insensitive" } },
      { shortDescription: { contains: "lighthouse", mode: "insensitive" } },
      { description: { contains: "lighthouse", mode: "insensitive" } },
      { category: { name: { contains: "lighthouse", mode: "insensitive" } } },
      {
        storyTags: {
          some: { tag: { name: { contains: "lighthouse", mode: "insensitive" } } },
        },
      },
    ]);
  });

  it("escapes LIKE wildcards in the term", () => {
    const where = buildStorySearchWhere({ ...empty, q: "50%_" });
    expect(where.OR?.[0]).toEqual({
      title: { contains: "50\\%\\_", mode: "insensitive" },
    });
  });

  it("filters by category slug", () => {
    const where = buildStorySearchWhere({ ...empty, category: "fantasy" });
    expect(where.category).toEqual({ slug: "fantasy" });
  });

  it("combines multiple tags with AND semantics", () => {
    const where = buildStorySearchWhere({
      ...empty,
      tags: ["epic", "magic"],
    });
    expect(where.AND).toEqual([
      { storyTags: { some: { tag: { slug: "epic" } } } },
      { storyTags: { some: { tag: { slug: "magic" } } } },
    ]);
  });

  it("combines a term with facets in one predicate", () => {
    const where = buildStorySearchWhere({
      q: "dune",
      category: "fantasy",
      tags: ["epic"],
    });
    expect(where.OR).toBeDefined();
    expect(where.category).toEqual({ slug: "fantasy" });
    expect(where.AND).toEqual([
      { storyTags: { some: { tag: { slug: "epic" } } } },
    ]);
  });
});
