/**
 * Storage primitives shared by every driver.
 *
 * `StorageError` is deliberately opaque: provider SDK messages can contain
 * bucket names, endpoints or keys, so callers never surface it to a client.
 * `.agent/skills/media-upload/SKILL.md`.
 */
export class StorageError extends Error {
  constructor(message = "Object storage failed.") {
    super(message);
    this.name = "StorageError";
  }
}

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  readonly driver: "s3" | "filesystem";
  /** Write (or overwrite) an object. Throws `StorageError` on failure. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read an object, or `null` when it does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Delete an object. Idempotent: a missing key is not an error. */
  delete(key: string): Promise<void>;
}
