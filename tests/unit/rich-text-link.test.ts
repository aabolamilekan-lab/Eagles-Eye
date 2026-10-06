import { describe, expect, it } from "vitest";
import { isAllowedLinkHref, normalizeLinkHref } from "@/lib/rich-text/link";

/**
 * Link destination normalisation.
 *
 * This is the editor's UX guard. It must never emit an executable scheme, and
 * it must refuse the obfuscation shapes a browser would still act on. The
 * server sanitizer is tested separately and remains the security boundary.
 */
describe("normalizeLinkHref", () => {
  it("keeps http and https addresses as written", () => {
    expect(normalizeLinkHref("https://example.com/a?b=1#c")).toBe(
      "https://example.com/a?b=1#c",
    );
    expect(normalizeLinkHref("http://example.com")).toBe("http://example.com");
  });

  it("keeps a mailto link", () => {
    expect(normalizeLinkHref("mailto:writer@example.com")).toBe(
      "mailto:writer@example.com",
    );
  });

  it("keeps a site-relative path and a fragment", () => {
    expect(normalizeLinkHref("/stories/x")).toBe("/stories/x");
    expect(normalizeLinkHref("#notes")).toBe("#notes");
  });

  it("prepends https to a bare host", () => {
    expect(normalizeLinkHref("example.com/reading")).toBe(
      "https://example.com/reading",
    );
  });

  it("trims surrounding whitespace before judging", () => {
    expect(normalizeLinkHref("  https://example.com  ")).toBe(
      "https://example.com",
    );
  });

  it("refuses an empty or whitespace-only value", () => {
    expect(normalizeLinkHref("")).toBeNull();
    expect(normalizeLinkHref("   ")).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "java\tscript:alert(1)",
    "java script:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/uuid",
  ])("refuses the dangerous destination %s", (value) => {
    expect(normalizeLinkHref(value)).toBeNull();
  });

  it("refuses protocol-relative and backslash paths", () => {
    expect(normalizeLinkHref("//evil.test")).toBeNull();
    expect(normalizeLinkHref("/\\evil.test")).toBeNull();
    expect(normalizeLinkHref("\\\\evil.test")).toBeNull();
  });

  it("refuses a value with an embedded newline and scheme", () => {
    expect(
      normalizeLinkHref("https://example.com\njavascript:alert(1)"),
    ).toBeNull();
  });
});

describe("isAllowedLinkHref", () => {
  it("accepts safe destinations", () => {
    expect(isAllowedLinkHref("https://example.com")).toBe(true);
    expect(isAllowedLinkHref("example.com")).toBe(true);
    expect(isAllowedLinkHref("mailto:x@example.com")).toBe(true);
  });

  it("rejects unsafe destinations", () => {
    expect(isAllowedLinkHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedLinkHref("//evil.test")).toBe(false);
    expect(isAllowedLinkHref("data:,x")).toBe(false);
  });
});
