import { describe, expect, it } from "vitest";
import { isCacheableStoryListRequest } from "@/lib/queries/public/stories";
import { isCacheableSearchRequest } from "@/lib/queries/public/search";
import {
  buildStaticEntries,
  sitemapLastModified,
  SITEMAP_CATEGORY_LIMIT,
  SITEMAP_PAGE_SIZE,
  SITEMAP_URL_LIMIT,
} from "@/lib/seo/sitemap";

/**
 * The data cache is keyed by request arguments. A free-text term and an
 * arbitrarily large page number are both reader-supplied, so admitting them into
 * the cache would let any request mint an entry, and every publish would then
 * expire all of them at once. These tests pin the boundary that prevents that.
 */
describe("public read cache boundary", () => {
  describe("catalogue list", () => {
    it("caches the unfiltered, taxonomy-bounded pages", () => {
      expect(isCacheableStoryListRequest({ q: "", page: 1 })).toBe(true);
      expect(isCacheableStoryListRequest({ q: "", page: 200 })).toBe(true);
    });

    it("never caches a free-text request, whatever the page", () => {
      expect(isCacheableStoryListRequest({ q: "dragon", page: 1 })).toBe(false);
      expect(isCacheableStoryListRequest({ q: "a", page: 1 })).toBe(false);
    });

    it("never caches an unbounded or malformed page", () => {
      expect(isCacheableStoryListRequest({ q: "", page: 201 })).toBe(false);
      expect(isCacheableStoryListRequest({ q: "", page: 1_000_000 })).toBe(false);
      expect(isCacheableStoryListRequest({ q: "", page: 0 })).toBe(false);
      expect(isCacheableStoryListRequest({ q: "", page: -3 })).toBe(false);
      expect(isCacheableStoryListRequest({ q: "", page: 1.5 })).toBe(false);
      expect(isCacheableStoryListRequest({ q: "", page: Number.NaN })).toBe(
        false,
      );
    });
  });

  describe("search", () => {
    it("caches facet-only browsing", () => {
      expect(isCacheableSearchRequest({ q: "", page: 1 })).toBe(true);
    });

    it("never caches a term-bearing request", () => {
      expect(isCacheableSearchRequest({ q: "dragon", page: 1 })).toBe(false);
    });

    it("never caches an unbounded page", () => {
      expect(isCacheableSearchRequest({ q: "", page: 1_000_000 })).toBe(false);
      expect(isCacheableSearchRequest({ q: "", page: 0 })).toBe(false);
    });
  });
});

describe("sitemap sizing", () => {
  it("stays under the protocol URL ceiling", () => {
    expect(SITEMAP_URL_LIMIT).toBeLessThanOrEqual(50_000);
  });

  it("reads the catalogue in pages smaller than the ceiling", () => {
    expect(SITEMAP_PAGE_SIZE).toBeLessThan(SITEMAP_URL_LIMIT);
    expect(SITEMAP_PAGE_SIZE).toBeGreaterThan(0);
  });

  it("bounds the category enumeration", () => {
    expect(SITEMAP_CATEGORY_LIMIT).toBeGreaterThan(0);
  });
});

describe("sitemapLastModified", () => {
  it("prefers the supplied date and falls back when it is absent or invalid", () => {
    const fallback = new Date("2024-01-01T00:00:00.000Z");

    expect(
      sitemapLastModified(new Date("2025-06-01T00:00:00.000Z"), fallback),
    ).toEqual(new Date("2025-06-01T00:00:00.000Z"));

    expect(sitemapLastModified(null, fallback)).toBe(fallback);
    expect(sitemapLastModified(undefined, fallback)).toBe(fallback);
    expect(sitemapLastModified(new Date("not a date"), fallback)).toBe(fallback);
  });
});

describe("buildStaticEntries", () => {
  const baseUrl = "https://stories.example";
  const latest = new Date("2025-01-01T00:00:00.000Z");

  it("emits only public, non-admin surfaces", () => {
    const entries = buildStaticEntries(baseUrl, [{ slug: "romance" }], latest);
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      `${baseUrl}/`,
      `${baseUrl}/stories`,
      `${baseUrl}/categories`,
      `${baseUrl}/categories/romance`,
      `${baseUrl}/about`,
    ]);
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
  });

  it("emits no entry without a URL", () => {
    for (const entry of buildStaticEntries(baseUrl, [], latest)) {
      expect(entry.url.startsWith(baseUrl)).toBe(true);
    }
  });

  it("dates every entry with the newest content date, never the clock", () => {
    for (const entry of buildStaticEntries(baseUrl, [{ slug: "romance" }], latest)) {
      expect(entry.lastModified).toEqual(latest);
    }
  });

  it("omits lastmod entirely when there is no content to date it by", () => {
    for (const entry of buildStaticEntries(baseUrl, [])) {
      expect(entry).not.toHaveProperty("lastModified");
    }
  });
});
