import { describe, expect, it } from "vitest";
import {
  clampPage,
  parseStoryListSearch,
  storyListHref,
  type StoryListSearch,
} from "@/lib/validation/story";

describe("parseStoryListSearch", () => {
  it("returns the unfiltered default for empty params", () => {
    expect(parseStoryListSearch({})).toEqual({
      q: "",
      category: null,
      tags: [],
      sort: "recent",
      page: 1,
      hasFilters: false,
    });
  });

  it("trims, collapses and caps the free-text query", () => {
    expect(parseStoryListSearch({ q: "  hello   world  " }).q).toBe(
      "hello world",
    );
    expect(parseStoryListSearch({ q: "a".repeat(150) }).q).toHaveLength(100);
    expect(parseStoryListSearch({ q: "   " }).q).toBe("");
  });

  it("keeps a positive page and repairs every invalid one", () => {
    expect(parseStoryListSearch({ page: "4" }).page).toBe(4);
    expect(parseStoryListSearch({ page: "0" }).page).toBe(1);
    expect(parseStoryListSearch({ page: "-1" }).page).toBe(1);
    expect(parseStoryListSearch({ page: "abc" }).page).toBe(1);
    expect(parseStoryListSearch({ page: "999999" }).page).toBe(999999);
  });

  it("accepts only whitelisted sort keys", () => {
    expect(parseStoryListSearch({ sort: "popular" }).sort).toBe("popular");
    expect(parseStoryListSearch({ sort: "oldest" }).sort).toBe("oldest");
    expect(parseStoryListSearch({ sort: "title" }).sort).toBe("title");
    expect(parseStoryListSearch({ sort: "views; DROP TABLE" }).sort).toBe(
      "recent",
    );
    expect(parseStoryListSearch({ sort: ["title", "popular"] }).sort).toBe(
      "title",
    );
  });

  it("normalizes a category slug and rejects anything not slug-shaped", () => {
    expect(parseStoryListSearch({ category: "Science-Fiction" }).category).toBe(
      "science-fiction",
    );
    expect(parseStoryListSearch({ category: "../etc/passwd" }).category).toBeNull();
    expect(parseStoryListSearch({ category: "a b" }).category).toBeNull();
    expect(parseStoryListSearch({ category: "" }).category).toBeNull();
  });

  it("deduplicates, sorts and caps tag slugs", () => {
    expect(parseStoryListSearch({ tag: ["beta", "alpha", "beta"] }).tags).toEqual(
      ["alpha", "beta"],
    );
    expect(parseStoryListSearch({ tag: "single" }).tags).toEqual(["single"]);
    expect(
      parseStoryListSearch({ tag: ["", "Bad Slug", "../x"] }).tags,
    ).toEqual([]);

    const many = Array.from({ length: 20 }, (_, index) => `tag-${index}`);
    expect(parseStoryListSearch({ tag: many }).tags).toHaveLength(8);
  });

  it("reports whether any filter is set", () => {
    expect(parseStoryListSearch({ q: " " }).hasFilters).toBe(false);
    expect(parseStoryListSearch({ page: "2" }).hasFilters).toBe(false);
    expect(parseStoryListSearch({ q: "dune" }).hasFilters).toBe(true);
    expect(parseStoryListSearch({ category: "fantasy" }).hasFilters).toBe(true);
    expect(parseStoryListSearch({ tag: "fantasy" }).hasFilters).toBe(true);
  });

  it("ignores unknown keys", () => {
    const parsed = parseStoryListSearch({ q: "dune", evil: "payload" });
    expect(parsed.q).toBe("dune");
    expect(parsed.hasFilters).toBe(true);
  });
});

describe("clampPage", () => {
  it("clamps a page into the real range", () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(-5, 3)).toBe(1);
    expect(clampPage(Number.NaN, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(999999, 3)).toBe(3);
  });

  it("clamps a page beyond the last inside an empty result", () => {
    expect(clampPage(5, 0)).toBe(1);
  });
});

describe("storyListHref", () => {
  const base: StoryListSearch = parseStoryListSearch({
    q: "dune",
    category: "fantasy",
    tag: ["epic"],
    sort: "popular",
    page: "3",
  });

  it("resets to page one by default", () => {
    expect(storyListHref(base)).toBe(
      "/stories?q=dune&category=fantasy&tag=epic&sort=popular",
    );
  });

  it("returns the bare path when nothing is set", () => {
    expect(storyListHref(parseStoryListSearch({}))).toBe("/stories");
  });

  it("can target a page while preserving every filter", () => {
    expect(storyListHref(base, { page: 3 })).toBe(
      "/stories?q=dune&category=fantasy&tag=epic&sort=popular&page=3",
    );
  });

  it("removes one filter at a time without disturbing the rest", () => {
    expect(storyListHref(base, { q: "" })).toBe(
      "/stories?category=fantasy&tag=epic&sort=popular",
    );
    expect(storyListHref(base, { category: null })).toBe(
      "/stories?q=dune&tag=epic&sort=popular",
    );
    expect(storyListHref(base, { tags: [] })).toBe(
      "/stories?q=dune&category=fantasy&sort=popular",
    );
  });
});
