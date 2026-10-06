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
