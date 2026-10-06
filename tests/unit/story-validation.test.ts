import { describe, expect, it } from "vitest";
import {
  adminStoryListHref,
  createStorySchema,
  parseAdminStoryListSearch,
  updateStorySchema,
} from "@/lib/validation/story";

describe("createStorySchema", () => {
  it("requires a non-empty title and trims it", () => {
    expect(createStorySchema.safeParse({ title: "  " }).success).toBe(false);

    const parsed = createStorySchema.parse({ title: "  Dune  " });
    expect(parsed.title).toBe("Dune");
  });

  it("rejects unknown keys so nothing extra reaches Prisma", () => {
    const result = createStorySchema.safeParse({
      title: "Dune",
      status: "PUBLISHED",
    });

    expect(result.success).toBe(false);
  });

  it("treats a blank slug as absent", () => {
    const parsed = createStorySchema.parse({ title: "Dune", slug: "  " });
    expect(parsed.slug).toBe("");
  });

  it("normalizes a blank category to null", () => {
    expect(createStorySchema.parse({ title: "Dune", categoryId: " " }).categoryId).toBe(
      null,
    );
    expect(
      createStorySchema.parse({ title: "Dune", categoryId: "cat_1" }).categoryId,
    ).toBe("cat_1");
  });

  it("accepts a stored cover key, and normalizes blank to null", () => {
    expect(
      createStorySchema.parse({ title: "Dune", coverImage: "" }).coverImage,
    ).toBeNull();
    const key =
      "covers/2026/10/11111111-1111-1111-1111-111111111111.webp";
    expect(
      createStorySchema.parse({ title: "Dune", coverImage: key }).coverImage,
    ).toBe(key);
  });

  it("rejects an external cover URL, so no remote host can reach the optimizer", () => {
    // A cover is always an object this app stores. Allowing an admin-typed URL
    // would require a next/image remote allowlist, which is an open image proxy
    // pointed at whatever hostname the admin names.
    for (const url of [
      "https://cdn.example.com/a.png",
      "http://cdn.example.com/a.png",
      "https://evil.example/a.png",
    ]) {
      const result = createStorySchema.safeParse({ title: "Dune", coverImage: url });
      expect(result.success).toBe(false);
    }
  });

  it("rejects a cover payload that could execute or traverse", () => {
    expect(
      createStorySchema.safeParse({
        title: "Dune",
        coverImage: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      createStorySchema.safeParse({ title: "Dune", coverImage: "../../etc/passwd" })
        .success,
    ).toBe(false);
  });

  it("deduplicates tag ids", () => {
    const parsed = createStorySchema.parse({
      title: "Dune",
      tagIds: ["a", "a", "b"],
    });

    expect(parsed.tagIds).toEqual(["a", "b"]);
  });
});

describe("updateStorySchema", () => {
  it("requires an id and defaults confirmSlugChange to false", () => {
    expect(updateStorySchema.safeParse({ title: "Dune" }).success).toBe(false);

    const parsed = updateStorySchema.parse({ id: "s1", title: "Dune" });
    expect(parsed.confirmSlugChange).toBe(false);
  });

  it("keeps an explicit confirmation", () => {
    const parsed = updateStorySchema.parse({
      id: "s1",
      title: "Dune",
      confirmSlugChange: true,
    });

    expect(parsed.confirmSlugChange).toBe(true);
  });
});

describe("parseAdminStoryListSearch", () => {
  it("returns the default view for empty params", () => {
    expect(parseAdminStoryListSearch({})).toEqual({
      q: "",
      status: "ALL",
      category: null,
      sort: "updated",
      page: 1,
    });
  });

  it("accepts whitelisted statuses and sorts only", () => {
    expect(parseAdminStoryListSearch({ status: "DRAFT" }).status).toBe("DRAFT");
    expect(
      parseAdminStoryListSearch({ status: "PUBLISHED; DROP TABLE" }).status,
    ).toBe("ALL");
    expect(parseAdminStoryListSearch({ sort: "title" }).sort).toBe("title");
    expect(parseAdminStoryListSearch({ sort: "nonsense" }).sort).toBe("updated");
  });

  it("normalizes a category slug and repairs bad pages", () => {
    expect(parseAdminStoryListSearch({ category: "Sci-Fi" }).category).toBe(
      "sci-fi",
    );
    expect(parseAdminStoryListSearch({ category: "../x" }).category).toBeNull();
    expect(parseAdminStoryListSearch({ page: "0" }).page).toBe(1);
    expect(parseAdminStoryListSearch({ page: "3" }).page).toBe(3);
  });
});

describe("adminStoryListHref", () => {
  const base = parseAdminStoryListSearch({});

  it("returns the bare path for the default view", () => {
    expect(adminStoryListHref(base)).toBe("/admin/stories");
  });

  it("omits default values from the query string", () => {
    expect(adminStoryListHref(base, { sort: "updated", status: "ALL" })).toBe(
      "/admin/stories",
    );
  });

  it("serializes every non-default value", () => {
    expect(
      adminStoryListHref(base, {
        q: "dune",
        status: "DRAFT",
        category: "sci-fi",
        sort: "published",
        page: 2,
      }),
    ).toBe("/admin/stories?q=dune&status=DRAFT&category=sci-fi&sort=published&page=2");
  });
});
