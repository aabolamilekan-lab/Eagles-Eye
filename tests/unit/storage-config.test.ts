import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Env } from "@/lib/env";
import { resolveStorageConfig, StorageConfigError } from "@/lib/storage/config";

/**
 * Storage driver resolution.
 *
 * A deployed environment must present all five S3 values together; a partial
 * set is a misconfiguration, not a fallback. Development and tests fall back to
 * a private filesystem root; production refuses to resolve.
 */
const BASE = { NODE_ENV: "development" } as Env;

function env(overrides: Partial<Env>): Env {
  return { ...BASE, ...overrides };
}

const FULL_S3: Partial<Env> = {
  STORAGE_ENDPOINT: "https://s3.example.com",
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "covers",
  STORAGE_ACCESS_KEY_ID: "id",
  STORAGE_SECRET_ACCESS_KEY: "secret",
};

describe("resolveStorageConfig", () => {
  it("selects S3 when all five values are present", () => {
    const config = resolveStorageConfig(env(FULL_S3));
    expect(config.driver).toBe("s3");
    if (config.driver === "s3") {
      expect(config.bucket).toBe("covers");
      expect(config.endpoint).toBe("https://s3.example.com");
      // Path style defaults to true for S3-compatible providers.
      expect(config.forcePathStyle).toBe(true);
    }
  });

  it("honours an explicit force-path-style flag", () => {
    const off = resolveStorageConfig(
      env({ ...FULL_S3, STORAGE_FORCE_PATH_STYLE: "false" }),
    );
    if (off.driver === "s3") {
      expect(off.forcePathStyle).toBe(false);
    } else {
      throw new Error("expected S3");
    }

    const on = resolveStorageConfig(
      env({ ...FULL_S3, STORAGE_FORCE_PATH_STYLE: "true" }),
    );
    if (on.driver === "s3") {
      expect(on.forcePathStyle).toBe(true);
    }
  });

  it("throws on a partial S3 configuration", () => {
    expect(() =>
      resolveStorageConfig(env({ STORAGE_BUCKET: "covers" })),
    ).toThrow(StorageConfigError);
  });

  it("treats empty strings as absent", () => {
    const config = resolveStorageConfig(
      env({
        STORAGE_ENDPOINT: "",
        STORAGE_REGION: "",
        STORAGE_BUCKET: "",
        STORAGE_ACCESS_KEY_ID: "",
        STORAGE_SECRET_ACCESS_KEY: "",
      }),
    );
    expect(config.driver).toBe("filesystem");
  });

  it("falls back to a private filesystem root in development", () => {
    const config = resolveStorageConfig(env({}));
    expect(config.driver).toBe("filesystem");
    if (config.driver === "filesystem") {
      expect(config.root).toBe(path.join(process.cwd(), ".storage"));
      expect(config.root).not.toContain(`${path.sep}public${path.sep}`);
    }
  });

  it("honours STORAGE_LOCAL_DIR", () => {
    const config = resolveStorageConfig(
      env({ STORAGE_LOCAL_DIR: "C:\\tmp\\ee-storage" }),
    );
    if (config.driver === "filesystem") {
      expect(config.root).toBe("C:\\tmp\\ee-storage");
    } else {
      throw new Error("expected filesystem");
    }
  });

  it("refuses to resolve in production without S3", () => {
    expect(() =>
      resolveStorageConfig(env({ NODE_ENV: "production" })),
    ).toThrow(StorageConfigError);
  });
});
