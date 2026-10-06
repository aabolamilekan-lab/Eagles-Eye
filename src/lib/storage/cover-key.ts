import { isSafeStorageKey } from "./keys";

/**
 * The one shape a stored cover key may take.
 *
 * Kept dependency-free so both the storage layer and the (potentially
 * client-bundled) validation schemas can import it without pulling in Node or
 * cloud SDK code.
 */
export const COVER_KEY_PATTERN =
  /^covers\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/**
 * True only for a well-formed, safe cover key.
 *
 * This is the single predicate every layer shares: the upload route, the image
 * route, story validation and `coverUrl()`. A cover is always a key minted by
 * the upload route — an external URL is never a valid cover — so the value that
 * passes here is exactly the value that can be served. Callers therefore cannot
 * build a cover URL that the image route would reject.
 */
export function isCoverKey(value: string): boolean {
  return COVER_KEY_PATTERN.test(value) && isSafeStorageKey(value);
}
