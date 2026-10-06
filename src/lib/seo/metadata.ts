import type { Metadata } from "next";

export const siteName = "Eagles Eye";
export const siteDescription =
  "A quiet catalogue for stories worth reading. Discover, explore, and read published stories and chapters without distraction.";

const DEFAULT_BASE_URL = "http://localhost:3000";

export function absoluteUrl(path: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
  );

  // An already-absolute URL is returned untouched. Blindly prefixing it produced
  // values like `http://host/https://cdn/x.jpg`, which is neither a valid URL
  // nor a resolvable image, so metadata and JSON-LD silently shipped garbage.
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function stripTrailingSlash(path: string): string {
  if (path === "/") return "/";
  return path.replace(/\/+$/, "");
}

export function buildCanonical(
  path: string,
  searchParams?: Record<string, string | string[] | undefined>
): string {
  const basePath = stripTrailingSlash(path);

  if (!searchParams) {
    return absoluteUrl(basePath === "" ? "/" : basePath);
  }

  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== undefined && v !== null && v !== "") {
          params.append(key, v);
        }
      });
    } else if (value !== "") {
      // Strip default values that create duplicate canonicals
      if (key === "page" && value === "1") return;
      if (key === "sort" && value === "recent") return;
      params.append(key, value);
    }
  });

  const query = params.toString();
  const canonicalPath = basePath === "" ? "/" : basePath;
  return query ? absoluteUrl(`${canonicalPath}?${query}`) : absoluteUrl(canonicalPath);
}

export function robotsForIndexable(): Metadata["robots"] {
  return { index: true, follow: true };
}

export function robotsForNonIndexable(): Metadata["robots"] {
  return { index: false, follow: true };
}

export function buildTitle(title: string): string {
  return `${title} | ${siteName}`;
}
