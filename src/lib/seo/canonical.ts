import { z } from "zod";

/**
 * Canonical URL foundation.
 *
 * Every absolute URL in metadata, Open Graph, JSON-LD, robots.txt and the
 * sitemap is built here from `NEXT_PUBLIC_APP_URL` (`.agent/skills/seo/SKILL.md`).
 * No page concatenates an absolute URL by hand, so a wrong host or scheme has
 * exactly one place to be caught: validated once, normalized once, reused
 * everywhere.
 *
 * Server-side only: read from Server Components, `generateMetadata`, and route
 * manifests, never from a Client Component.
 */

const DEFAULT_LOCAL_URL = "http://localhost:3000";

const baseUrlSchema = z.string().url();

/** A bad value is reported by key only; the value itself is never echoed. */
function invalidBaseUrl(): Error {
  return new Error(
    "Invalid environment configuration. Missing or invalid: NEXT_PUBLIC_APP_URL",
  );
}

/**
 * The validated application base URL with no trailing slash.
 *
 * - **Production:** a missing, relative, non-http(s) or query-carrying
 *   `NEXT_PUBLIC_APP_URL` throws at first use — which is build or boot —
 *   instead of silently emitting broken or attacker-shaped canonicals.
 * - **Development and test:** an unset value falls back to localhost so a dev
 *   server starts without configuration. A *set but invalid* value still
 *   throws in every environment, so a misconfigured preview fails loudly
 *   rather than publishing wrong URLs.
 */
export function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;

  if (raw === undefined || raw.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      throw invalidBaseUrl();
    }
    return DEFAULT_LOCAL_URL;
  }

  const parsed = baseUrlSchema.safeParse(raw.trim());
  if (!parsed.success) {
    throw invalidBaseUrl();
  }

  const url = new URL(parsed.data);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidBaseUrl();
  }
  if (url.search !== "" || url.hash !== "") {
    throw invalidBaseUrl();
  }

  // `new URL` lowercases the host and normalizes the path. The trailing slash
  // is stripped so `absoluteUrl` can join a path without producing `//`;
  // `absoluteUrl("/")` re-adds it for the site root, which is the one URL
  // allowed to end in a slash.
  return url.href.replace(/\/+$/, "");
}

/**
 * Resolve an application path against the base URL.
 *
 * - An already-absolute `http(s)` path is returned untouched: blindly prefixing
 *   it produced values like `http://host/https://cdn/x.jpg`, and metadata
 *   silently shipped garbage.
 * - Resolution is a *relative* join against `<base>/`, not
 *   `new URL("/path", base)`: a leading-slash path would discard a sub-path
 *   base (`https://host/app`), while the relative join keeps it. A base with a
 *   trailing slash, a sub-path, or a port all resolve correctly.
 * - A fragment is dropped (a canonical never carries one) and duplicate
 *   slashes inside the path are collapsed. The query string, when present, is
 *   preserved: page 2 is different content and keeps `?page=2`.
 */
export function absoluteUrl(path: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = (baseUrl ?? siteBaseUrl()).replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;

  const withoutFragment = normalized.split("#")[0] ?? "";
  const queryIndex = withoutFragment.indexOf("?");
  const pathname =
    queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex);

  const cleanPathname = pathname.replace(/\/{2,}/g, "/");
  const relative = `${cleanPathname.slice(1)}${query}`;

  return new URL(relative, `${base}/`).toString();
}
