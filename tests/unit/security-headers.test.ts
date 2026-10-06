import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * Response security headers.
 *
 * Asserted against the real `headers()` output rather than the source text, so
 * these describe what a response actually carries. That also catches a `const`
 * read above its declaration, which is a load-time ReferenceError rather than a
 * test failure.
 */

type HeaderEntry = { source: string; headers: { key: string; value: string }[] };

async function routeHeaders(): Promise<HeaderEntry[]> {
  const rules = await nextConfig.headers?.();
  return (rules ?? []) as HeaderEntry[];
}

/** The headers that apply to a public path, with later entries winning. */
async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = await routeHeaders();
  const merged: Record<string, string> = {};

  for (const rule of rules) {
    const prefix = rule.source.split("/:path*")[0];
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      for (const header of rule.headers) {
        merged[header.key] = header.value;
      }
    }
  }

  return merged;
}

describe("global security headers", () => {
  it("applies to public pages and to the admin", async () => {
    for (const path of ["/", "/stories", "/admin", "/admin/stories/new", "/search"]) {
      const headers = await headersFor(path);
      expect(headers["Content-Security-Policy"], `missing CSP on ${path}`).toBeDefined();
      expect(headers["Strict-Transport-Security"], `missing HSTS on ${path}`).toBeDefined();
    }
  });

  it("sets a Content-Security-Policy", async () => {
    const headers = await headersFor("/");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });

  it("locks the CSP down to the app's own origin", async () => {
    const csp = (await headersFor("/"))["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("never grants a remote script or style origin", async () => {
    const csp = (await headersFor("/"))["Content-Security-Policy"];
    // A bare host in script-src or style-src would let an injected tag pull
    // executable code from a third party.
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
    expect(csp).not.toMatch(/style-src[^;]*https?:/);
    expect(csp).not.toMatch(/default-src[^;]*\*/);
    // `data:` is permitted for images only. As a script source it would be a
    // direct `data:text/javascript` execution primitive.
    expect(csp).not.toMatch(/script-src[^;]*data:/);
    expect(csp).not.toMatch(/default-src[^;]*data:/);
    expect(csp).toMatch(/img-src[^;]*data:/);
  });

  it("allows inline script because Next inlines the RSC flight payload", async () => {
    // Documented, not ideal: the browser must execute Next's bootstrap. It is
    // scoped to 'self' documents and cannot be reached by injected markup.
    const csp = (await headersFor("/"))["Content-Security-Policy"];
    expect(csp).toMatch(/script-src[^;]*'self'/);
  });

  it("denies framing at the CSP level as well as the legacy header", async () => {
    const headers = await headersFor("/");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("sends HSTS with a year max-age", async () => {
    const hsts = (await headersFor("/"))["Strict-Transport-Security"];
    expect(hsts).toMatch(/max-age=\d{7,}/);
  });

  it("does not request HSTS preload, which cannot be withdrawn", async () => {
    // Preload is a commitment for a domain, not a config value; setting it from
    // a config file is effectively irreversible once a browser caches it.
    expect((await headersFor("/"))["Strict-Transport-Security"]).not.toContain("preload");
  });

  it("keeps the pre-existing baseline headers", async () => {
    const headers = await headersFor("/");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("sets cross-origin isolation headers", async () => {
    const headers = await headersFor("/");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  });

  it("does not expose the framework banner", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("indexing headers stay off public pages", () => {
  it("marks admin as noindex", async () => {
    const headers = await headersFor("/admin/stories");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });

  it("does not mark a public story as noindex", async () => {
    // Public reader pages must stay indexable.
    const headers = await headersFor("/stories/the-cartographers-debt");
    expect(headers["X-Robots-Tag"]).toBeUndefined();
  });

  it("still serves CSP and HSTS alongside noindex", async () => {
    const headers = await headersFor("/admin/stories");
    expect(headers["Content-Security-Policy"]).toBeDefined();
    expect(headers["Strict-Transport-Security"]).toBeDefined();
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });
});
