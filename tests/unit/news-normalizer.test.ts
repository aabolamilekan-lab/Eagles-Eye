import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  normalizeCanonicalUrl,
  sanitizeTextSnippet,
  stripHtmlAndCollapseWhitespace,
} from "@/lib/news/normalizer";

describe("normalizeCanonicalUrl", () => {
  it("lowercases protocol and hostname", () => {
    expect(normalizeCanonicalUrl("HTTPS://WWW.EXAMPLE.COM/news/article")).toBe(
      "https://www.example.com/news/article",
    );
  });

  it("strips standard default ports", () => {
    expect(normalizeCanonicalUrl("http://example.com:80/story")).toBe(
      "http://example.com/story",
    );
    expect(normalizeCanonicalUrl("https://example.com:443/story")).toBe(
      "https://example.com/story",
    );
  });

  it("preserves non-default ports", () => {
    expect(normalizeCanonicalUrl("https://example.com:8443/story")).toBe(
      "https://example.com:8443/story",
    );
  });

  it("removes trailing slash from path (unless root path)", () => {
    expect(normalizeCanonicalUrl("https://example.com/world/news/")).toBe(
      "https://example.com/world/news",
    );
    expect(normalizeCanonicalUrl("https://example.com/")).toBe(
      "https://example.com/",
    );
  });

  it("collapses duplicate slashes in pathname", () => {
    expect(normalizeCanonicalUrl("https://example.com//world///news")).toBe(
      "https://example.com/world/news",
    );
  });

  it("strips URL fragment identifiers", () => {
    expect(
      normalizeCanonicalUrl("https://example.com/news/article#comments-section"),
    ).toBe("https://example.com/news/article");
  });

  it("strips marketing and analytics tracking query parameters", () => {
    const raw =
      "https://example.com/article?utm_source=rss&utm_medium=feed&utm_campaign=daily&fbclid=IwAR123&ref=rss_feed&gclid=abc456";
    expect(normalizeCanonicalUrl(raw)).toBe("https://example.com/article");
  });

  it("preserves legitimate resource query parameters", () => {
    const raw =
      "https://example.com/read?id=98765&section=tech&utm_source=twitter";
    expect(normalizeCanonicalUrl(raw)).toBe(
      "https://example.com/read?id=98765&section=tech",
    );
  });

  it("sorts query parameters deterministically", () => {
    const url1 = "https://example.com/item?z=last&a=first&m=middle";
    const url2 = "https://example.com/item?m=middle&z=last&a=first";
    expect(normalizeCanonicalUrl(url1)).toBe(normalizeCanonicalUrl(url2));
    expect(normalizeCanonicalUrl(url1)).toBe(
      "https://example.com/item?a=first&m=middle&z=last",
    );
  });

  it("preserves multi-valued query parameters without duplicating entries", () => {
    const raw = "https://example.com/filter?tag=tech&tag=ai&utm_source=rss";
    expect(normalizeCanonicalUrl(raw)).toBe(
      "https://example.com/filter?tag=tech&tag=ai",
    );
  });

  it("throws on malformed or unsupported URLs", () => {
    expect(() => normalizeCanonicalUrl("not a url")).toThrow(/Malformed URL/);
    expect(() => normalizeCanonicalUrl("ftp://example.com/file")).toThrow(
      /Unsupported URL protocol/,
    );
    expect(() => normalizeCanonicalUrl("")).toThrow(/non-empty string/);
  });
});

describe("computeContentHash", () => {
  it("produces deterministic 64-character SHA-256 hex string", () => {
    const hash = computeContentHash(
      "Breaking: Major Event Occurred",
      "Officials confirmed the details earlier today.",
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is insensitive to trivial whitespace and casing variations", () => {
    const hash1 = computeContentHash(
      "  Breaking: Major Event   ",
      "Officials   confirmed.",
    );
    const hash2 = computeContentHash(
      "breaking: major event",
      "officials confirmed.",
    );
    expect(hash1).toBe(hash2);
  });

  it("detects substantive changes in content", () => {
    const hash1 = computeContentHash(
      "Headline 1",
      "Original report description.",
    );
    const hash2 = computeContentHash(
      "Headline 1",
      "Updated report with revised casualty numbers.",
    );
    expect(hash1).not.toBe(hash2);
  });
});

describe("stripHtmlAndCollapseWhitespace", () => {
  it("strips HTML tags and decodes common entities", () => {
    const raw = "<p>Hello <strong>World</strong>! &amp; welcome &quot;all&quot;.</p>";
    expect(stripHtmlAndCollapseWhitespace(raw)).toBe('Hello World! & welcome "all".');
  });

  it("collapses multiple consecutive spaces and newlines", () => {
    const raw = "First   line \n\n  second    line\t\tend";
    expect(stripHtmlAndCollapseWhitespace(raw)).toBe("First line second line end");
  });
});

describe("sanitizeTextSnippet", () => {
  it("clamps long text to word boundary without cutting in the middle of a word", () => {
    const long =
      "The quick brown fox jumps over the lazy dog and runs through the forest effortlessly.";
    const clamped = sanitizeTextSnippet(long, 35);
    expect(clamped?.length).toBeLessThanOrEqual(35);
    expect(clamped).toBe("The quick brown fox jumps over the");
  });

  it("returns null for empty or whitespace-only snippets", () => {
    expect(sanitizeTextSnippet("   ")).toBeNull();
    expect(sanitizeTextSnippet(null)).toBeNull();
  });
});
