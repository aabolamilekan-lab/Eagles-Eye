import { describe, expect, it } from "vitest";
import { isChapterContentEmpty } from "@/lib/chapters/content";

describe("isChapterContentEmpty", () => {
  it("treats absent, empty and whitespace-only markup as empty", () => {
    expect(isChapterContentEmpty(null)).toBe(true);
    expect(isChapterContentEmpty("")).toBe(true);
    expect(isChapterContentEmpty("<p></p>")).toBe(true);
    expect(isChapterContentEmpty("<p>   </p>")).toBe(true);
    expect(isChapterContentEmpty("<p>&nbsp;</p>")).toBe(true);
    expect(isChapterContentEmpty("<p>\n\t</p>")).toBe(true);
  });

  it("finds body text inside inline formatting", () => {
    expect(isChapterContentEmpty("<p>Hello</p>")).toBe(false);
    expect(isChapterContentEmpty("<p><strong>Hi</strong></p>")).toBe(false);
    expect(isChapterContentEmpty("<h2>Chapter one</h2>")).toBe(false);
  });

  it("does not treat leftover text nodes as empty", () => {
    // Sanitization removes <script>, but if any text survived it is real body.
    expect(isChapterContentEmpty("<script>alert(1)</script>")).toBe(false);
  });
});
