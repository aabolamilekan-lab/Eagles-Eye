import { describe, expect, it } from "vitest";
import { coverUrl } from "@/lib/seo/cover-url";
import { absoluteUrl } from "@/lib/seo/canonical";
import { isCoverKey } from "@/lib/storage/cover-key";

/**
 * A cover must always be an object this application stores.
 *
 * These tests pin the regression that started this: `coverImage` accepted an
 * external `https://` URL, `coverUrl()` encoded it into `/api/images/<url>`,
 * and the image route — which only serves storage keys — returned 404 for every
 * reader. The same value also flowed into Open Graph and JSON-LD through
 * `absoluteUrl`, producing `http://host/https://cdn/x.jpg`.
 */

const VALID_KEY = "covers/2026/10/11111111-1111-1111-1111-111111111111.webp";

describe("coverUrl", () => {
  it("builds the image route path for a stored key", () => {
    expect(coverUrl(VALID_KEY)).toBe(
      `/api/images/${encodeURIComponent(VALID_KEY)}`,
    );
  });

  it("returns null for no cover", () => {
    expect(coverUrl(null)).toBeNull();
    expect(coverUrl("")).toBeNull();
  });

  it("returns null for an external URL instead of a URL that always 404s", () => {
    // The defect: these used to become /api/images/https%3A%2F%2F..., which the
    // image route cannot serve, so the cover silently never rendered.
    expect(coverUrl("https://cdn.example.com/a.png")).toBeNull();
    expect(coverUrl("http://cdn.example.com/a.png")).toBeNull();
  });

  it("returns null for dangerous and non-cover values", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/etc/passwd",
      "../../.env",
      "covers/../../secret.webp",
      "covers/2026/10/not-a-uuid.webp",
      "notcovers/2026/10/11111111-1111-1111-1111-111111111111.webp",
    ]) {
      expect(coverUrl(value)).toBeNull();
    }
  });

  it("is total: every non-null result is a key the image route will accept", () => {
    // The property that matters. If coverUrl ever returns a value, the route
    // must be able to serve it; otherwise the reader gets a broken image.
    const candidates = [
      VALID_KEY,
      "covers/2026/01/00000000-0000-4000-8000-000000000000.webp",
      "https://cdn.example.com/a.png",
      "javascript:alert(1)",
      "covers/2026/10/11111111-1111-1111-1111-111111111111.webp/../../x",
      "covers\\2026\\10\\11111111-1111-1111-1111-111111111111.webp",
      "",
      "not-a-key",
    ];

    for (const candidate of candidates) {
      const url = coverUrl(candidate);
      if (url === null) {
        continue;
      }
      const key = decodeURIComponent(url.replace("/api/images/", ""));
      expect(isCoverKey(key)).toBe(true);
    }
  });
});

describe("absoluteUrl", () => {
  it("prefixes a site-relative path", () => {
    expect(absoluteUrl("/stories/x", "https://example.com")).toBe(
      "https://example.com/stories/x",
    );
    expect(absoluteUrl("stories/x", "https://example.com")).toBe(
      "https://example.com/stories/x",
    );
  });

  it("tolerates a trailing slash on the base", () => {
    expect(absoluteUrl("/stories/x", "https://example.com/")).toBe(
      "https://example.com/stories/x",
    );
  });

  it("returns an already-absolute URL untouched", () => {
    // The defect: this used to produce
    // "https://example.com/https://cdn.example.com/a.png", which is not a URL
    // at all, and shipped broken Open Graph and JSON-LD images.
    expect(absoluteUrl("https://cdn.example.com/a.png", "https://example.com")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(absoluteUrl("http://cdn.example.com/a.png", "https://example.com")).toBe(
      "http://cdn.example.com/a.png",
    );
  });

  it("does not treat a protocol-relative path as absolute", () => {
    // It is a path, not a host: it resolves against this origin (duplicate
    // slashes normalized away), never against evil.example. Prefixing the
    // base instead of resolving would leave the origin intact too, but the
    // point of the assertion is that the origin never moves.
    expect(absoluteUrl("//evil.example/x", "https://example.com")).toBe(
      "https://example.com/evil.example/x",
    );
  });
});

describe("a cover URL is never a remote host", () => {
  it("holds for a stored key through the SEO layer", () => {
    const url = coverUrl(VALID_KEY);
    expect(url).not.toBeNull();
    // Same origin as the app: the image route, never a third party.
    expect(new URL(absoluteUrl(url as string, "https://example.com")).origin).toBe(
      "https://example.com",
    );
  });
});
