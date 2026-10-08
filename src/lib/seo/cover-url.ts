import { isCoverKey } from "@/lib/storage/cover-key";

/**
 * The one way a stored cover key becomes a URL a browser can load.
 *
 * Deliberately dependency-free apart from the key predicate: this is imported by
 * the public query layer, the SEO helpers and the admin uploader, so it must not
 * pull in Prisma, the storage driver or `next/*`.
 *
 * Total by construction. A cover is always a key minted by the upload route, so
 * this returns `null` for anything else rather than emitting a path the image
 * route would 404. That matters: encoding an arbitrary URL into
 * `/api/images/<url>` produces a link that fails for every reader, and the same
 * mistake in the SEO helpers produced malformed absolute URLs.
 */
export function coverUrl(key: string | null): string | null {
  if (!key || !isCoverKey(key)) {
    return null;
  }
  return `/api/images/${encodeURIComponent(key)}`;
}

/** Exact social-card dimensions the image route can render on request. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const OG_TRANSFORM_QUERY = `w=${OG_IMAGE_WIDTH}&h=${OG_IMAGE_HEIGHT}`;

/**
 * The social-card rendition of an image path.
 *
 * Covers are arbitrary shapes; shipping a portrait original as the card makes
 * every platform letterbox it. The image route re-encodes to an exact
 * 1200×630 crop when asked, so the OG and Twitter URLs carry that request.
 * The default card image is already 1200×630 and passes through untouched, as
 * does any path that is not the cover route. Callers resolve a missing cover
 * to the default card image first, so the result is never null.
 */
export function ogImageUrl(url: string): string {
  if (!url.startsWith("/api/images/") || url.includes("?")) {
    return url;
  }
  return `${url}?${OG_TRANSFORM_QUERY}`;
}
