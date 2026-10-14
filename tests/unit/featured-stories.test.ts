import { describe, expect, it, vi } from "vitest";
import { ContentStatus } from "@prisma/client";
import {
  buildStoryListWhere,
  PUBLIC_STORY_WHERE,
} from "@/lib/queries/public/story-filter";
import { canFeature } from "@/lib/stories/transitions";
import {
  featuredListHref,
  type StoryListSearch,
} from "@/lib/validation/story";
import { revalidatePublicStoryCaches } from "@/lib/stories/revalidate";
import * as nextCache from "next/cache";

vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return {
    ...actual,
    revalidatePath: vi.fn(),
    updateTag: vi.fn(),
  };
});

describe("Featured stories feature", () => {
  describe("Public filtering and visibility", () => {
    const emptyFilters = { q: "", category: null, tags: [] };

    it("applies featured: true alongside public published-status constraint", () => {
      const where = buildStoryListWhere({ ...emptyFilters, featured: true });

      expect(where.featured).toBe(true);
      expect(where.status).toBe(ContentStatus.PUBLISHED);
      expect(PUBLIC_STORY_WHERE.status).toBe(ContentStatus.PUBLISHED);
    });

    it("leaves featured undefined when not specified", () => {
      const where = buildStoryListWhere(emptyFilters);

      expect(where.featured).toBeUndefined();
      expect(where.status).toBe(ContentStatus.PUBLISHED);
    });

    it("combines featured filter with category and tag facets", () => {
      const where = buildStoryListWhere({
        ...emptyFilters,
        featured: true,
        category: "frontier-chronicles",
        tags: ["adventure"],
      });

      expect(where.featured).toBe(true);
      expect(where.status).toBe(ContentStatus.PUBLISHED);
      expect(where.category).toEqual({ slug: "frontier-chronicles" });
      expect(where.AND).toEqual([
        { storyTags: { some: { tag: { slug: "adventure" } } } },
      ]);
    });
  });

  describe("Admin authorization and status transition constraints", () => {
    it("allows featuring only for published stories", () => {
      expect(canFeature(ContentStatus.PUBLISHED)).toBe(true);
      expect(canFeature(ContentStatus.DRAFT)).toBe(false);
      expect(canFeature(ContentStatus.ARCHIVED)).toBe(false);
    });
  });

  describe("URL routing and pagination for /featured", () => {
    const baseSearch: StoryListSearch = {
      q: "",
      category: null,
      tags: [],
      sort: "recent",
      page: 1,
      hasFilters: false,
    };

    it("generates clean /featured URL when on page 1 with no filters", () => {
      expect(featuredListHref(baseSearch)).toBe("/featured");
    });

    it("includes page parameter when navigating beyond page 1", () => {
      expect(featuredListHref(baseSearch, { page: 2 })).toBe("/featured?page=2");
    });

    it("preserves sort and category facets in /featured query string", () => {
      const url = featuredListHref(baseSearch, {
        category: "quiet-machines",
        sort: "popular",
        page: 3,
      });

      expect(url).toContain("/featured?");
      expect(url).toContain("category=quiet-machines");
      expect(url).toContain("sort=popular");
      expect(url).toContain("page=3");
    });
  });

  describe("Cache invalidation", () => {
    it("invalidates public caches including /featured on story mutation", () => {
      const updateTagSpy = vi.spyOn(nextCache, "updateTag");
      const revalidatePathSpy = vi.spyOn(nextCache, "revalidatePath");

      revalidatePublicStoryCaches();

      expect(updateTagSpy).toHaveBeenCalledWith("public:stories");
      expect(revalidatePathSpy).toHaveBeenCalledWith("/");
      expect(revalidatePathSpy).toHaveBeenCalledWith("/stories");
      expect(revalidatePathSpy).toHaveBeenCalledWith("/featured");
    });
  });
});
