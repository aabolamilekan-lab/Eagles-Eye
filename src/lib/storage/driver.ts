import { resolveStorageConfig } from "./config";
import { createFilesystemStorage } from "./filesystem";
import { createS3Storage } from "./s3";
import type { ObjectStorage } from "./types";

/**
 * The active object store, resolved once per process.
 *
 * Resolution is lazy so a missing configuration surfaces as a typed request
 * failure the first time storage is used, rather than at import time. Tests
 * call `resetStorageForTests` after changing environment variables.
 */
let cached: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  cached ??= createStorageFromEnv();
  return cached;
}

function createStorageFromEnv(): ObjectStorage {
  const config = resolveStorageConfig();
  return config.driver === "s3"
    ? createS3Storage(config)
    : createFilesystemStorage(config);
}

/** Test-only: drop the memoized driver. */
export function resetStorageForTests(): void {
  cached = null;
}
