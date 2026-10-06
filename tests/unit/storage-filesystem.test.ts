import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesystemStorage } from "@/lib/storage/filesystem";

/**
 * Filesystem driver.
 *
 * The development/test fallback. Writes are rooted and every resolved path is
 * re-checked for containment, so a bad key cannot escape even if the key guard
 * were bypassed.
 */
describe("createFilesystemStorage", () => {
  let root = "";
  let storage: ReturnType<typeof createFilesystemStorage>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ee-storage-"));
    storage = createFilesystemStorage({ driver: "filesystem", root });
  });

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("round-trips an object and derives its content type", async () => {
    const body = Buffer.from([1, 2, 3, 4, 5]);
    await storage.put("covers/2026/10/x.webp", body, "image/webp");

    const stored = await storage.get("covers/2026/10/x.webp");
    expect(stored).not.toBeNull();
    expect(stored?.body.equals(body)).toBe(true);
    expect(stored?.contentType).toBe("image/webp");
  });

  it("returns null for a missing object", async () => {
    expect(await storage.get("covers/2026/10/missing.webp")).toBeNull();
  });

  it("deletes idempotently", async () => {
    await storage.put("covers/2026/10/x.webp", Buffer.from([1]), "image/webp");
    await storage.delete("covers/2026/10/x.webp");
    expect(await storage.get("covers/2026/10/x.webp")).toBeNull();
    await expect(
      storage.delete("covers/2026/10/x.webp"),
    ).resolves.toBeUndefined();
  });

  it("refuses a traversal key", async () => {
    await expect(
      storage.put("../escaped.webp", Buffer.from([1]), "image/webp"),
    ).rejects.toThrow(TypeError);
    await expect(storage.get("../../etc/passwd")).rejects.toThrow(TypeError);
  });

  it("reports its driver name", () => {
    expect(storage.driver).toBe("filesystem");
  });
});
