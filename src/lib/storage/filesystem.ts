import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FilesystemStorageConfig } from "./config";
import { assertSafeStorageKey } from "./keys";
import { StorageError, type ObjectStorage } from "./types";

/**
 * Development and test driver: a private directory outside `public/`.
 *
 * Writes are rooted under `config.root` and every resolved path is re-checked
 * for containment, so a compromised key cannot escape even if the key guard
 * were bypassed. Content type is derived from the extension because the server
 * only ever writes generated cover objects.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf(".");
  const extension = dot === -1 ? "" : key.slice(dot).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export function createFilesystemStorage(
  config: FilesystemStorageConfig,
): ObjectStorage {
  const root = path.resolve(config.root);

  function resolvePath(key: string): string {
    assertSafeStorageKey(key);
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new TypeError("Unsafe storage key.");
    }
    return full;
  }

  return {
    driver: "filesystem",

    async put(key, body, _contentType) {
      const full = resolvePath(key);
      try {
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, body);
      } catch {
        throw new StorageError();
      }
    },

    async get(key) {
      const full = resolvePath(key);
      try {
        const body = await readFile(full);
        return { body, contentType: contentTypeFor(key) };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw new StorageError();
      }
    },

    async delete(key) {
      const full = resolvePath(key);
      try {
        await rm(full, { force: true });
      } catch (error) {
        if (isNotFound(error)) {
          return;
        }
        throw new StorageError();
      }
    },
  };
}
