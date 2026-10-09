import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ContentStatus,
  type PrismaClient,
  type UserRole,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover image route.
 *
 * Exercises the two authorization dimensions: the story must reference the key,
 * and the requester must be allowed to see that story. A draft is served only
 * to an authorized admin; everything else returns the same 404 as an unknown
 * key. Real PostgreSQL, real filesystem storage watched through the driver.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const storageRoot = path.join(tmpdir(), `ee-images-${process.pid}`);
const PREFIX = `itimage-${process.pid}`;

process.env.STORAGE_LOCAL_DIR = storageRoot;

vi.mock("@/lib/auth/guards", () => ({ getSession: vi.fn() }));

import { getSession } from "@/lib/auth/guards";
import { resetEnvCacheForTests } from "@/lib/env";
import { buildCoverKey } from "@/lib/storage/covers";
import { getStorage, resetStorageForTests } from "@/lib/storage/driver";

type RouteModule = typeof import("@/app/api/images/[...key]/route");

function adminSession() {
  return {
    userId: "test-admin",
    role: "ADMIN" as UserRole,
    email: "admin@example.com",
    name: "Admin",
  };
}

function get(key: string): Promise<Response> {
  return route.GET(new Request("http://localhost/api/images/cover"), {
    params: Promise.resolve({ key: [key] }),
  });
}

function getWithSegments(segments: string[]): Promise<Response> {
  return route.GET(new Request("http://localhost/api/images/cover"), {
    params: Promise.resolve({ key: segments }),
  });
}

let route: RouteModule;
let prisma: PrismaClient;
let publicKey = "";
let draftKey = "";
let noChapterKey = "";
let orphanKey = "";

describe.skipIf(!hasDatabase)("cover image route", () => {
  beforeAll(async () => {
    resetEnvCacheForTests();
    resetStorageForTests();

    const db = await import("@/lib/db");
    prisma = db.prisma;
    route = await import("@/app/api/images/[...key]/route");

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    publicKey = buildCoverKey();
    draftKey = buildCoverKey();
    noChapterKey = buildCoverKey();
    orphanKey = buildCoverKey();

    const storage = getStorage();
    const object = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    for (const key of [publicKey, draftKey, noChapterKey]) {
      await storage.put(key, object, "image/webp");
    }
    // orphanKey is deliberately never stored and never referenced.

    const published = await prisma.story.create({
      data: {
        title: "Route Public",
        slug: `${PREFIX}-public`,
        coverImage: publicKey,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.chapter.create({
      data: {
        storyId: published.id,
        chapterNumber: 1,
        title: "One",
        slug: "one",
        content: "<p>Hello</p>",
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await prisma.story.create({
      data: {
        title: "Route Draft",
        slug: `${PREFIX}-draft`,
        coverImage: draftKey,
        status: ContentStatus.DRAFT,
      },
    });

    // Published with no published chapter: the story is public, so the cover is.
    await prisma.story.create({
      data: {
        title: "Route Empty",
        slug: `${PREFIX}-empty`,
        coverImage: noChapterKey,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  });

  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(getSession).mockResolvedValue(null);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
      await prisma.$disconnect();
    }
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("returns 404 for a key that is not a cover key", async () => {
    expect((await get("covers/2026/10/not-a-uuid.webp")).status).toBe(404);
  });

  it("returns 404 for a traversal-shaped key", async () => {
    expect(
      (await getWithSegments(["covers", "2026", "10", "..", "..", "x.webp"]))
        .status,
    ).toBe(404);
  });

  it("returns 404 for a valid key no story references", async () => {
    expect((await get(orphanKey)).status).toBe(404);
  });

  it("serves a public story's cover with an immutable cache", async () => {
    const response = await get(publicKey);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("hides a draft cover from anonymous readers", async () => {
    expect((await get(draftKey)).status).toBe(404);
  });

  it("serves a draft cover to an authorized admin with a private cache", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession());
    const response = await get(draftKey);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("serves a published story's cover even when no chapter is published yet", async () => {
    const response = await get(noChapterKey);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });
});
