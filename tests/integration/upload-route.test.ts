import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { UserRole } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover upload route.
 *
 * Authorization is mocked at the session boundary (it is tested in the guard's
 * own suite); everything else is real — origin check, bounded read, magic-byte
 * sniffing, sharp re-encode and the filesystem driver. Skipped unless
 * `DATABASE_URL` is set, matching the project's integration convention even
 * though this route does not itself touch the database.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const storageRoot = path.join(tmpdir(), `ee-upload-${process.pid}`);

process.env.UPLOAD_MAX_BYTES = "65536";
process.env.STORAGE_LOCAL_DIR = storageRoot;

vi.mock("@/lib/auth/guards", () => ({ getSession: vi.fn() }));

const APP_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
).origin;
const UPLOAD_URL = "http://localhost/api/admin/uploads";

import { getSession } from "@/lib/auth/guards";
import { deleteCover, isCoverKey } from "@/lib/storage/covers";
import { resetStorageForTests } from "@/lib/storage/driver";
import { resetEnvCacheForTests } from "@/lib/env";
import { resetUploadLimiterForTests } from "@/lib/rate-limit/upload";

type RouteModule = typeof import("@/app/api/admin/uploads/route");

function adminSession() {
  return {
    userId: "test-admin",
    role: "ADMIN" as UserRole,
    email: "admin@example.com",
    name: "Admin",
  };
}

function viewerSession() {
  return {
    userId: "test-viewer",
    role: "VIEWER" as unknown as UserRole,
    email: "viewer@example.com",
    name: "Viewer",
  };
}

function multipartRequest(options: {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  origin?: string | null;
}): Request {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(options.bytes)], options.filename, {
      type: options.mime,
    }),
  );
  const headers = new Headers();
  const origin = options.origin === undefined ? APP_ORIGIN : options.origin;
  if (origin !== null) {
    headers.set("origin", origin);
  }
  return new Request(UPLOAD_URL, { method: "POST", headers, body: form });
}

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 4, g: 8, b: 16 },
    },
  })
    .png()
    .toBuffer();
}

describe.skipIf(!hasDatabase)("cover upload route", () => {
  let route: RouteModule;

  beforeAll(async () => {
    resetEnvCacheForTests();
    resetStorageForTests();
    resetUploadLimiterForTests();
    route = await import("@/app/api/admin/uploads/route");
  });

  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(getSession).mockResolvedValue(adminSession());
  });

  afterAll(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("rejects a non-multipart request", async () => {
    const response = await route.POST(
      new Request(UPLOAD_URL, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_ORIGIN },
        body: "{}",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects a request with no origin", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: await tinyPng(),
        filename: "cover.png",
        mime: "image/png",
        origin: null,
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a cross-origin request", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: await tinyPng(),
        filename: "cover.png",
        mime: "image/png",
        origin: "https://evil.example.com",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("requires an authenticated session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await route.POST(
      multipartRequest({
        bytes: await tinyPng(),
        filename: "cover.png",
        mime: "image/png",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("forbids a role without stories.manage", async () => {
    vi.mocked(getSession).mockResolvedValue(viewerSession());
    const response = await route.POST(
      multipartRequest({
        bytes: await tinyPng(),
        filename: "cover.png",
        mime: "image/png",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a declared type that is not allowed", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: Buffer.from("GIF89a"),
        filename: "cover.gif",
        mime: "image/gif",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects an extension that disagrees with the type", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: await tinyPng(),
        filename: "cover.jpg",
        mime: "image/png",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects bytes that do not match the declared type", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: Buffer.from("MZ this is an executable"),
        filename: "cover.png",
        mime: "image/png",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects an oversized file", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: Buffer.alloc(70_000, 1),
        filename: "cover.png",
        mime: "image/png",
      }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects a corrupt image that has a valid signature", async () => {
    const bytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("not really png data"),
    ]);
    const response = await route.POST(
      multipartRequest({ bytes, filename: "cover.png", mime: "image/png" }),
    );
    expect(response.status).toBe(422);
  });

  it("stores a valid image and returns a cover key", async () => {
    const response = await route.POST(
      multipartRequest({
        bytes: await tinyPng(),
        filename: "My Cover Photo.PNG",
        mime: "image/png",
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean; key?: string };
    expect(payload.ok).toBe(true);
    expect(payload.key).toBeDefined();

    const key = payload.key ?? "";
    expect(isCoverKey(key)).toBe(true);

    await deleteCover(key);
  });
});
