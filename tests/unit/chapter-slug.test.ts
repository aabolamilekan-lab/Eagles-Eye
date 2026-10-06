import { describe, expect, it } from "vitest";
import { uniqueChapterSlug } from "@/lib/slug";

/**
 * Chapter slugs are scoped per story, not globally. The `isTaken` callback is
 * the story boundary, so two stories may each hold a `chapter-1`.
 */
function scoped(takenByStory: Map<string, Set<string>>) {
  return (storyId: string) => async (slug: string) =>
    (takenByStory.get(storyId) ?? new Set<string>()).has(slug);
}

describe("uniqueChapterSlug", () => {
  it("derives the base from the title", async () => {
    await expect(
      uniqueChapterSlug("The Long Road", async () => false),
    ).resolves.toBe("the-long-road");
  });

  it("falls back to 'chapter', not 'story', for an unusable title", async () => {
    await expect(uniqueChapterSlug("!!!", async () => false)).resolves.toBe(
      "chapter",
    );
  });

  it("appends a suffix within the same story when taken", async () => {
    const taken = new Set(["chapter", "chapter-2"]);
    await expect(
      uniqueChapterSlug("!!!", async (slug) => taken.has(slug)),
    ).resolves.toBe("chapter-3");
  });

  it("allows the same slug in two different stories", async () => {
    const byStory = new Map<string, Set<string>>();
    const isTakenFor = scoped(byStory);

    const first = await uniqueChapterSlug("Prologue", isTakenFor("story-a"));
    const second = await uniqueChapterSlug("Prologue", isTakenFor("story-b"));

    expect(first).toBe("prologue");
    expect(second).toBe("prologue");
    expect(first).toBe(second);
  });
});
