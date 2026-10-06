import type { S3StorageConfig } from "./config";
import { assertSafeStorageKey } from "./keys";
import { StorageError, type ObjectStorage } from "./types";

/**
 * S3-compatible driver (AWS S3, MinIO, Cloudflare R2, …).
 *
 * The SDK is imported lazily so it never enters a client bundle and so a
 * filesystem-only deployment does not pay for it. Credentials live only in the
 * client instance created here; they are never logged and never returned.
 * Provider errors are collapsed into an opaque `StorageError` so bucket names
 * and keys cannot leak to a response.
 */
type S3Module = typeof import("@aws-sdk/client-s3");

interface Connection {
  sdk: S3Module;
  client: InstanceType<S3Module["S3Client"]>;
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const named = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (named.name === "NoSuchKey" || named.name === "NotFound") {
    return true;
  }
  return named.$metadata?.httpStatusCode === 404;
}

export function createS3Storage(config: S3StorageConfig): ObjectStorage {
  async function connect(): Promise<Connection> {
    const sdk = await import("@aws-sdk/client-s3");
    const client = new sdk.S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    return { sdk, client };
  }

  let connection: Promise<Connection> | null = null;
  function getConnection(): Promise<Connection> {
    connection ??= connect();
    return connection;
  }

  return {
    driver: "s3",

    async put(key, body, contentType) {
      assertSafeStorageKey(key);
      const { sdk, client } = await getConnection();
      try {
        await client.send(
          new sdk.PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
      } catch {
        throw new StorageError();
      }
    },

    async get(key) {
      assertSafeStorageKey(key);
      const { sdk, client } = await getConnection();
      try {
        const response = await client.send(
          new sdk.GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (!response.Body) {
          return null;
        }
        const bytes = await (
          response.Body as { transformToByteArray(): Promise<Uint8Array> }
        ).transformToByteArray();
        return {
          body: Buffer.from(bytes),
          contentType: response.ContentType ?? "application/octet-stream",
        };
      } catch (error) {
        if (isMissingObject(error)) {
          return null;
        }
        throw new StorageError();
      }
    },

    async delete(key) {
      assertSafeStorageKey(key);
      const { sdk, client } = await getConnection();
      try {
        await client.send(
          new sdk.DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
      } catch {
        throw new StorageError();
      }
    },
  };
}
