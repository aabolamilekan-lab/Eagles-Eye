import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, siteBaseUrl } from "@/lib/seo/canonical";

const BASE = "https://seo.test";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteBaseUrl", () => {
  it("returns the configured base with the trailing slash stripped", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://stories.example/");
    expect(siteBaseUrl()).toBe("https://stories.example");
  });

  it("keeps a sub-path base intact", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com/app");
    expect(siteBaseUrl()).toBe("https://example.com/app");
  });

  it("falls back to localhost when unset outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    expect(siteBaseUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "   ");
    expect(siteBaseUrl()).toBe("http://localhost:3000");
  });

  it("throws when unset in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => siteBaseUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("throws for a set but invalid value in every environment", () => {
    const invalid = [
      "not-a-url",
      "ftp://files.example",
      "https://seo.test/app?x=1",
      "https://seo.test/app#frag",
      "javascript:alert(1)",
    ];
    for (const value of invalid) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", value);
      expect(() => siteBaseUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
    }
  });

  it("never echoes the rejected value in the error message", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://secret.internal/app#leak");
    expect(() => siteBaseUrl()).not.toThrow(/secret\.internal/);
  });
});

describe("absoluteUrl", () => {
  it("joins a path onto the configured base", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
    expect(absoluteUrl("/stories")).toBe("https://seo.test/stories");
    expect(absoluteUrl("stories")).toBe("https://seo.test/stories");
    expect(absoluteUrl("/")).toBe("https://seo.test/");
  });

  it("resolves against an explicit base, with or without a trailing slash", () => {
    expect(absoluteUrl("/about", "https://other.example")).toBe(
      "https://other.example/about",
    );
    expect(absoluteUrl("/about", "https://other.example/")).toBe(
      "https://other.example/about",
    );
  });

  it("keeps a sub-path base instead of discarding it", () => {
    expect(absoluteUrl("/stories/x", "https://host/app")).toBe(
      "https://host/app/stories/x",
    );
  });

  it("preserves the query and drops the fragment", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
    expect(absoluteUrl("/stories?page=2")).toBe(
      "https://seo.test/stories?page=2",
    );
    expect(absoluteUrl("/stories/x#section")).toBe(
      "https://seo.test/stories/x",
    );
    expect(absoluteUrl("/stories/x?y=1#section")).toBe(
      "https://seo.test/stories/x?y=1",
    );
  });

  it("collapses duplicate slashes in the path", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
    expect(absoluteUrl("//stories//x")).toBe("https://seo.test/stories/x");
    expect(absoluteUrl("//evil.example/x")).toBe(
      "https://seo.test/evil.example/x",
    );
  });

  it("passes an already-absolute URL through untouched", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
    expect(absoluteUrl("https://cdn.example/cover.jpg")).toBe(
      "https://cdn.example/cover.jpg",
    );
    expect(absoluteUrl("http://cdn.example/cover.jpg")).toBe(
      "http://cdn.example/cover.jpg",
    );
  });
});
