import path from "node:path";
import { getEnv, type Env } from "@/lib/env";

/**
 * Storage configuration resolution.
 *
 * A deployed environment must present all five S3 values together; a partial
 * set is a misconfiguration, not a fallback. Development and tests may omit
 * them and use a private filesystem root outside `public/`, so the upload
 * pipeline is exercisable without cloud credentials. Production refuses to
 * resolve rather than accept an upload it cannot store.
 *
 * This module is server-only. It reads secrets and is never imported by a
 * Client Component (AGENTS.md section 12).
 */
export type StorageConfig = S3StorageConfig | FilesystemStorageConfig;

export interface S3StorageConfig {
  driver: "s3";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface FilesystemStorageConfig {
  driver: "filesystem";
  /** Absolute root. Objects live under `<root>/<key>` and are never served directly. */
  root: string;
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

const S3_KEYS = [
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
] as const;

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Decide the active driver. Throws a named error (never a value) when the
 * environment is internally inconsistent.
 */
export function resolveStorageConfig(env: Env = getEnv()): StorageConfig {
  const values = {
    endpoint: clean(env.STORAGE_ENDPOINT),
    region: clean(env.STORAGE_REGION),
    bucket: clean(env.STORAGE_BUCKET),
    accessKeyId: clean(env.STORAGE_ACCESS_KEY_ID),
    secretAccessKey: clean(env.STORAGE_SECRET_ACCESS_KEY),
  };

  const present = S3_KEYS.filter((key) => clean(env[key]) !== null).length;

  if (present === S3_KEYS.length) {
    return {
      driver: "s3",
      endpoint: values.endpoint as string,
      region: values.region as string,
      bucket: values.bucket as string,
      accessKeyId: values.accessKeyId as string,
      secretAccessKey: values.secretAccessKey as string,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE !== "false",
    };
  }

  if (present > 0) {
    const missing = S3_KEYS.filter((key) => clean(env[key]) === null);
    throw new StorageConfigError(
      `Storage is partially configured. Missing: ${missing.join(", ")}`,
    );
  }

  if (env.NODE_ENV === "production") {
    throw new StorageConfigError(
      "Storage is not configured. Set the STORAGE_* variables before serving uploads.",
    );
  }

  return {
    driver: "filesystem",
    root: clean(env.STORAGE_LOCAL_DIR) ?? path.join(process.cwd(), ".storage"),
  };
}
