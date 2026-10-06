import { describe, expect, it } from "vitest";
import {
  categoriesIndexHref,
  categoryStoryHref,
  createCategorySchema,
  createTagSchema,
  parseCategoryPage,
  TAXONOMY_DESCRIPTION_MAX,
  TAXONOMY_NAME_MAX,
  updateCategorySchema,
  updateTagSchema,
} from "@/lib/validation/taxonomy";
import {
  resolveCategoryNotice,
  resolveTagNotice,
} from "@/lib/taxonomy/form";

describe("createCategorySchema", () => {
  it("requires a non-empty name and trims it", () => {
    expect(createCategorySchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createCategorySchema.parse({ name: "  Frontier  " }).name).toBe(
      "Frontier",
    );
  });

  it("caps the name length", () => {
    const tooLong = "x".repeat(TAXONOMY_NAME_MAX + 1);
    expect(createCategorySchema.safeParse({ name: tooLong }).success).toBe(
      false,
    );
  });

  it("treats a blank slug as absent", () => {
    const parsed = createCategorySchema.parse({ name: "Frontier", slug: "  " });
    expect(parsed.slug).toBe("");
  });

  it("caps the description length", () => {
    const tooLong = "x".repeat(TAXONOMY_DESCRIPTION_MAX + 1);
    expect(
      createCategorySchema.safeParse({ name: "Frontier", description: tooLong })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys so nothing extra reaches Prisma", () => {
    expect(
      createCategorySchema.safeParse({ name: "Frontier", id: "cat_1" }).success,
    ).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("requires an id", () => {
    expect(updateCategorySchema.safeParse({ name: "Frontier" }).success).toBe(
      false,
    );
    expect(
      updateCategorySchema.safeParse({ id: "cat_1", name: "Frontier" }).success,
    ).toBe(true);
  });
});

describe("tag schemas", () => {
  it("requires a name and rejects unknown keys", () => {
    expect(createTagSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      createTagSchema.safeParse({ name: "Adventure", description: "extra" })
        .success,
    ).toBe(false);
  });

  it("requires an id on update", () => {
    expect(updateTagSchema.safeParse({ name: "Adventure" }).success).toBe(false);
    expect(
      updateTagSchema.safeParse({ id: "tag_1", name: "Adventure" }).success,
    ).toBe(true);
  });
});

describe("categoryStoryHref", () => {
  it("returns the bare path for the default state", () => {
    expect(categoryStoryHref("frontier", { sort: "recent", page: 1 })).toBe(
      "/categories/frontier",
    );
  });

  it("serializes only non-default values", () => {
    expect(categoryStoryHref("frontier", { sort: "title", page: 3 })).toBe(
      "/categories/frontier?sort=title&page=3",
    );
    expect(categoryStoryHref("frontier", { sort: "recent", page: 2 })).toBe(
      "/categories/frontier?page=2",
    );
  });
});

describe("categoriesIndexHref", () => {
  it("omits the first page", () => {
    expect(categoriesIndexHref(1)).toBe("/categories");
    expect(categoriesIndexHref(4)).toBe("/categories?page=4");
  });
});

describe("parseCategoryPage", () => {
  it("defaults malformed and non-positive values to one", () => {
    expect(parseCategoryPage(undefined)).toBe(1);
    expect(parseCategoryPage("")).toBe(1);
    expect(parseCategoryPage("0")).toBe(1);
    expect(parseCategoryPage("-3")).toBe(1);
    expect(parseCategoryPage("abc")).toBe(1);
  });

  it("parses the first value of an array", () => {
    expect(parseCategoryPage(["2", "9"])).toBe(2);
    expect(parseCategoryPage("5")).toBe(5);
  });
});

describe("notice resolvers", () => {
  it("maps known keys and ignores everything else", () => {
    expect(resolveCategoryNotice("created")?.title).toBe("Category created");
    expect(resolveTagNotice("deleted")?.title).toBe("Tag deleted");
    expect(resolveCategoryNotice("nonsense")).toBeNull();
    expect(resolveTagNotice(undefined)).toBeNull();
  });

  it("reads the first value of an array and never reflects raw text", () => {
    expect(resolveCategoryNotice(["saved"])?.title).toBe("Category saved");
    expect(resolveCategoryNotice(["<script>"])).toBeNull();
  });
});
