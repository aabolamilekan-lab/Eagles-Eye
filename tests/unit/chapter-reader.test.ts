import { describe, expect, it } from "vitest";
import { resolveChapterNeighbours } from "@/lib/queries/public/chapter-order";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";

/**
 * Chapter reader unit tests.
 *
 * Two contract surfaces: neighbour resolution over a published-only list, and
 * the allowlist sanitizer that every stored chapter body passes through.
 */

describe("resolveChapterNeighbours", () => {
  // Published chapters 1 and 3 of a story whose 2 is a draft. The draft is not
  // in the list the caller passes, so numbering is by published position.
  const published = [
    { slug: "one", title: "One" },
    { slug: "three", title: "Three" },
  ];

  it("offers no previous and the next published chapter at the start", () => {
    expect(resolveChapterNeighbours(published, 0)).toEqual({
      previous: null,
      next: { slug: "three", title: "Three" },
      currentNumber: 1,
      totalCount: 2,
    });
  });

  it("offers the previous published chapter and no next at the end", () => {
    expect(resolveChapterNeighbours(published, 1)).toEqual({
      previous: { slug: "one", title: "One" },
      next: null,
      currentNumber: 2,
      totalCount: 2,
    });
  });

  it("skips the drafted chapter: never reports a position of 3 of 2", () => {
    const last = resolveChapterNeighbours(published, 1);
    expect(last.currentNumber).toBe(2);
    expect(last.totalCount).toBe(2);
  });

  it("handles a single published chapter at both boundaries", () => {
    expect(
      resolveChapterNeighbours([{ slug: "only", title: "Only" }], 0),
    ).toEqual({
      previous: null,
      next: null,
      currentNumber: 1,
      totalCount: 1,
    });
  });
});

describe("sanitizeRichText", () => {
  it("strips a script element and its contents", () => {
    const clean = sanitizeRichText("<p>Hi</p><script>alert(1)</script>");

    expect(clean).toBe("<p>Hi</p>");
    expect(clean).not.toContain("alert");
  });

  it("strips javascript: hrefs", () => {
    const clean = sanitizeRichText('<a href="javascript:alert(1)">x</a>');

    expect(clean).not.toContain("javascript:");
    expect(clean).toContain(">x</a>");
  });

  it("strips data: image sources", () => {
    const clean = sanitizeRichText(
      '<img src="data:image/png;base64,AAAA" alt="a">',
    );

    expect(clean).not.toContain("data:");
    expect(clean).toContain('alt="a"');
  });

  it("removes event handlers and unknown attributes", () => {
    const clean = sanitizeRichText('<p onclick="steal()" data-x="1">x</p>');

    expect(clean).toBe("<p>x</p>");
  });

  it("forces a safe rel on every link, even without target", () => {
    const clean = sanitizeRichText('<a href="https://example.com">x</a>');

    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it("offsets stored headings by one level and clamps at h6", () => {
    const clean = sanitizeRichText("<h1>A</h1><h2>B</h2><h6>Z</h6>", {
      headingOffset: 1,
    });

    expect(clean).toBe("<h2>A</h2><h3>B</h3><h6>Z</h6>");
  });

  it("leaves headings unchanged when no offset is requested", () => {
    expect(sanitizeRichText("<h1>A</h1>")).toBe("<h1>A</h1>");
  });

  it("keeps a chosen text alignment on a paragraph", () => {
    expect(sanitizeRichText('<p style="text-align: center">x</p>')).toBe(
      '<p style="text-align:center">x</p>',
    );
  });

  it("keeps a chosen alignment through a heading offset", () => {
    expect(
      sanitizeRichText('<h1 style="text-align: right">A</h1>', {
        headingOffset: 1,
      }),
    ).toBe('<h2 style="text-align:right">A</h2>');
  });

  it("writes no style attribute when no alignment was chosen", () => {
    expect(sanitizeRichText("<p>x</p><h2>y</h2>")).toBe("<p>x</p><h2>y</h2>");
  });

  it("drops an iframe and its contents entirely", () => {
    const clean = sanitizeRichText('<iframe src="https://evil.test"></iframe>');

    expect(clean).not.toContain("iframe");
    expect(clean).not.toContain("evil.test");
  });

  it("unwraps a disallowed tag but keeps its text", () => {
    expect(sanitizeRichText("<div>keep</div>")).toBe("keep");
  });
});
