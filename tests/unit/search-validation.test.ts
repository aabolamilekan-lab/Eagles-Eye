import { describe, expect, it } from "vitest";
import {
  normalizeSearchQuery,
  parseStorySearch,
  searchHref,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from "@/lib/validation/search";

describe("normalizeSearchQuery", () => {
  it("collapses whitespace and trims the term", () => {
    expect(normalizeSearchQuery("  hello   world  ")).toEqual({
      value: "hello world",
      status: "ok",
    });
  });

  it("folds look-alike Unicode with NFKC", () => {
    // Full-width characters normalize to their ASCII equivalents.
    expect(normalizeSearchQuery("Ｌｉｇｈｔ").value).toBe("Light");
  });

  it("strips control and zero-width characters", () => {
    expect(normalizeSearchQuery("li\u0000ght\u200B").value).toBe("light");
    expect(normalizeSearchQuery(" \u200B\u2060 ").status).toBe("empty");
  });

  it("classifies empty, short, long and valid terms", () => {
    expect(normalizeSearchQuery("").status).toBe("empty");
    expect(normalizeSearchQuery("   ").status).toBe("empty");
    expect(
      normalizeSearchQuery("a".repeat(SEARCH_QUERY_MIN_LENGTH - 1)).status,
    ).toBe("too_short");
    expect(
      normalizeSearchQuery("a".repeat(SEARCH_QUERY_MIN_LENGTH)).status,
    ).toBe("ok");
    expect(
      normalizeSearchQuery("a".repeat(SEARCH_QUERY_MAX_LENGTH)).status,
    ).toBe("ok");
    expect(
      normalizeSearchQuery("a".repeat(SEARCH_QUERY_MAX_LENGTH + 1)).status,
    ).toBe("too_long");
  });

  it("keeps the rejected text so the field can echo it", () => {
    const long = "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1);
    expect(normalizeSearchQuery(long)).toEqual({
      value: long,
      status: "too_long",
    });
    expect(normalizeSearchQuery("x")).toEqual({
      value: "x",
      status: "too_short",
    });
  });
});

describe("parseStorySearch", () => {
  it("returns the idle default for empty params", () => {
    expect(parseStorySearch({})).toEqual({
      q: "",
      typedQuery: "",
      queryStatus: "empty",
      category: null,
      tags: [],
      sort: "recent",
      page: 1,
      hasFilters: false,
      runnable: false,
    });
  });

  it("runs a valid term", () => {
    const search = parseStorySearch({ q: "dune" });
    expect(search.q).toBe("dune");
    expect(search.queryStatus).toBe("ok");
    expect(search.runnable).toBe(true);
    expect(search.hasFilters).toBe(true);
  });

  it("keeps a too-short term out of the runnable set but visible to the field", () => {
    const search = parseStorySearch({ q: "a" });
    expect(search.queryStatus).toBe("too_short");
    expect(search.typedQuery).toBe("a");
    expect(search.q).toBe("");
    expect(search.runnable).toBe(false);
  });

  it("rejects an over-long term", () => {
    const search = parseStorySearch({ q: "a".repeat(500) });
    expect(search.queryStatus).toBe("too_long");
    expect(search.q).toBe("");
    expect(search.runnable).toBe(false);
  });

  it("runs a facet-only search with no term", () => {
    const byCategory = parseStorySearch({ category: "fantasy" });
    expect(byCategory.queryStatus).toBe("empty");
    expect(byCategory.category).toBe("fantasy");
    expect(byCategory.runnable).toBe(true);
    expect(byCategory.hasFilters).toBe(true);

    const byTag = parseStorySearch({ tag: "sci-fi" });
    expect(byTag.tags).toEqual(["sci-fi"]);
    expect(byTag.runnable).toBe(true);
  });

  it("does not treat sort or page alone as a runnable search", () => {
    expect(parseStorySearch({ sort: "popular" }).runnable).toBe(false);
    expect(parseStorySearch({ page: "3" }).runnable).toBe(false);
  });

  it("normalizes facets through the shared catalogue rules", () => {
    const search = parseStorySearch({
      category: "Science-Fiction",
      tag: ["beta", "alpha", "beta"],
      sort: "popular",
      page: "4",
    });
    expect(search.category).toBe("science-fiction");
    expect(search.tags).toEqual(["alpha", "beta"]);
    expect(search.sort).toBe("popular");
    expect(search.page).toBe(4);
  });

  it("repairs invalid facet values instead of failing", () => {
    const search = parseStorySearch({
      category: "../etc/passwd",
      sort: "drop table",
      page: "-1",
    });
    expect(search.category).toBeNull();
    expect(search.sort).toBe("recent");
    expect(search.page).toBe(1);
  });
});

describe("searchHref", () => {
  const base = parseStorySearch({
    q: "dune",
    category: "fantasy",
    tag: ["epic"],
    sort: "popular",
    page: "3",
  });

  it("resets to page one by default", () => {
    expect(searchHref(base)).toBe(
      "/search?q=dune&category=fantasy&tag=epic&sort=popular",
    );
  });

  it("returns the bare path when nothing is set", () => {
    expect(searchHref(parseStorySearch({}))).toBe("/search");
  });

  it("can target a page while preserving every filter", () => {
    expect(searchHref(base, { page: 3 })).toBe(
      "/search?q=dune&category=fantasy&tag=epic&sort=popular&page=3",
    );
  });

  it("removes one filter at a time without disturbing the rest", () => {
    expect(searchHref(base, { q: "" })).toBe(
      "/search?category=fantasy&tag=epic&sort=popular",
    );
    expect(searchHref(base, { category: null })).toBe(
      "/search?q=dune&tag=epic&sort=popular",
    );
    expect(searchHref(base, { tags: [] })).toBe(
      "/search?q=dune&category=fantasy&sort=popular",
    );
  });

  it("drops the default sort from the URL", () => {
    const plain = parseStorySearch({ q: "dune", sort: "recent" });
    expect(searchHref(plain)).toBe("/search?q=dune");
  });
});
