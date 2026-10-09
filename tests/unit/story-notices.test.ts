import { describe, expect, it } from "vitest";
import { resolveStoryNotice } from "@/lib/stories/notices";

describe("resolveStoryNotice", () => {
  it("maps each known notice key to a safe alert", () => {
    for (const key of [
      "created",
      "saved",
      "deleted",
      "published",
      "unpublished",
      "archived",
      "restored",
      "featured",
      "unfeatured",
      "cover-removed",
    ]) {
      const notice = resolveStoryNotice(key);
      expect(notice).not.toBeNull();
      expect(notice?.title.length).toBeGreaterThan(0);
    }
  });

  it("never reflects an unknown value", () => {
    expect(resolveStoryNotice("evil")).toBeNull();
    expect(resolveStoryNotice("<script>alert(1)</script>")).toBeNull();
    expect(resolveStoryNotice(undefined)).toBeNull();
    expect(resolveStoryNotice(null)).toBeNull();
  });

  it("uses the first value when the query repeats", () => {
    expect(resolveStoryNotice(["saved", "evil"])?.title).toBe("Changes saved");
  });

  it("no longer maps the removed publish warning", () => {
    expect(resolveStoryNotice("publish-warning")).toBeNull();
  });
});
