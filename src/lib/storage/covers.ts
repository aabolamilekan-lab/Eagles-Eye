import { randomUUID } from "node:crypto";
import { COVER_KEY_PATTERN, isCoverKey } from "./cover-key";
import { getStorage } from "./driver";
import type { StoredObject } from "./types";

/**
 * Cover-object keys and helpers.
 *
 * Keys are opaque and server-generated: `covers/<yyyy>/<mm>/<uuid>.webp`. The
 * stored object is always WebP because sharp re-encoded it. `isCoverKey` is the
 * shared predicate, owned by `./cover-key` so validation and URL building read
 * the same contract the image route enforces.
 */
export { COVER_KEY_PATTERN, isCoverKey };

export function buildCoverKey(now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `covers/${year}/${month}/${randomUUID()}.webp`;
}

/** Store a processed cover and return its generated key. */
export async function putCover(buffer: Buffer): Promise<string> {
  const key = buildCoverKey();
  await getStorage().put(key, buffer, "image/webp");
  return key;
}

/** Read a stored cover, or `null` when absent or not a valid key. */
export async function getCoverObject(key: string): Promise<StoredObject | null> {
  if (!isCoverKey(key)) {
    return null;
  }
  return getStorage().get(key);
}

/**
 * Delete a stored cover. No-op for a value that is not a stored key.
 * Throws `StorageError` if the driver fails.
 */
export async function deleteCover(key: string): Promise<void> {
  if (!isCoverKey(key)) {
    return;
  }
  await getStorage().delete(key);
}
