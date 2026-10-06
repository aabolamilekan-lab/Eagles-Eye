import { describe, expect, it, vi } from "vitest";
import { slugifyTitle, uniqueSlug } from "@/lib/slug";

describe("slugifyTitle", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugifyTitle("The Fall of Eagles Eye")).toBe(
      "the-fall-of-eagles-eye",
    );
  });

  it("strips diacritics rather than dropping the letters", () => {
    expect(slugifyTitle("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("collapses a run of punctuation into one hyphen", () => {
    expect(slugifyTitle("Hello --- World!!")).toBe("hello-world");
  });

  it("trims leading and trailing separators", () => {
    expect(slugifyTitle("  ...Dune...  ")).toBe("dune");
  });

  it("caps a long multi-word title on a hyphen boundary", () => {
    const slug = slugifyTitle(`${"a".repeat(60)} ${"b".repeat(60)}`);

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toBe("a".repeat(60));
  });

  it("caps a single long word at the limit", () => {
    expect(slugifyTitle("a".repeat(200))).toBe("a".repeat(80));
  });

  it("falls back when nothing usable remains", () => {
    expect(slugifyTitle("!!!")).toBe("story");
    expect(slugifyTitle("日本語")).toBe("story");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", async () => {
    const isTaken = vi.fn().mockResolvedValue(false);

    await expect(uniqueSlug("dune", isTaken)).resolves.toBe("dune");
    expect(isTaken).toHaveBeenCalledWith("dune");
  });

  it("appends the first free numeric suffix", async () => {
    const taken = new Set(["dune", "dune-2", "dune-3"]);

    await expect(uniqueSlug("dune", async (slug) => taken.has(slug))).resolves.toBe(
      "dune-4",
    );
  });

  it("always terminates with a value when every suffix is taken", async () => {
    const slug = await uniqueSlug("dune", async () => true);

    expect(slug).toMatch(/^dune-[0-9a-z]+$/);
    expect(slug).not.toBe("dune");
  });
});
