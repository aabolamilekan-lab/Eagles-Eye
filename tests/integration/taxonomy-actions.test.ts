import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type PrismaClient } from "@prisma/client";

/**
 * Category and tag mutations against a real PostgreSQL database.
 *
 * Skipped unless `DATABASE_URL` is set. `next/navigation` is stubbed so a
 * successful action's `redirect` surfaces as a thrown signal we can read, the
 * capability guard is mocked to a real admin, and `next/cache` is stubbed so
 * `revalidatePublicStoryCaches` never needs a request context. The database is
 * real, so the case-insensitive uniqueness checks, the `Restrict` category
 * foreign key and the `StoryTag` cascade are exercised for real (AGENTS.md
 * sections 8, 9, 13, 14 and 17).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itax-${process.pid}`;

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    readonly url: string;
    constructor(url: string) {
      super(`redirect:${url}`);
      this.name = "RedirectError";
      this.url = url;
    }
  }
  return { RedirectError };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: vi.fn().mockResolvedValue({ userId: "test-admin" }),
  requireWriteCapability: vi.fn().mockResolvedValue({ userId: "test-admin" }),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { requireWriteCapability } from "@/lib/auth/guards";
import { INITIAL_TAXONOMY_FORM_STATE } from "@/lib/taxonomy/form";

type CategoryActions = typeof import("@/actions/category");
type TagActions = typeof import("@/actions/tag");

const INITIAL = INITIAL_TAXONOMY_FORM_STATE;

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) data.append(key, item);
    } else {
      data.set(key, value);
    }
  }
  return data;
}

async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) {
      return error.url;
    }
    throw error;
  }
  throw new Error("expected the action to redirect");
}

function idFromEditUrl(url: string, segment: string): string {
  const match = new RegExp(`^/admin/${segment}/([^/]+)/edit`).exec(url);
  const id = match?.[1];
  if (!id) {
    throw new Error(`unexpected redirect: ${url}`);
  }
  return id;
}

describe.skipIf(!hasDatabase)("taxonomy actions (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let categoryActions: CategoryActions;
  let tagActions: TagActions;

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    categoryActions = await import("@/actions/category");
    tagActions = await import("@/actions/tag");

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("re-checks categories.manage before creating", async () => {
    vi.mocked(requireWriteCapability).mockClear();

    await expectRedirect(() =>
      categoryActions.createCategoryAction(
        INITIAL,
        form({ name: `${PREFIX} Capability Category` }),
      ),
    );

    expect(requireWriteCapability).toHaveBeenCalledWith("categories.manage");
  });

  it("creates a category with a generated slug and description", async () => {
    const url = await expectRedirect(() =>
      categoryActions.createCategoryAction(
        INITIAL,
        form({
          name: `${PREFIX} Frontier Chronicles`,
          description: "  Tales from the edge.  ",
        }),
      ),
    );

    expect(url).toContain("notice=created");
    const id = idFromEditUrl(url, "categories");

    const category = await prisma.category.findUnique({ where: { id } });
    expect(category?.name).toBe(`${PREFIX} Frontier Chronicles`);
    expect(category?.slug).toBe(`${PREFIX}-frontier-chronicles`);
    expect(category?.description).toBe("Tales from the edge.");
  });

  it("refuses a duplicate name case-insensitively", async () => {
    const state = await categoryActions.createCategoryAction(
      INITIAL,
      form({ name: `${PREFIX} FRONTIER CHRONICLES` }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.name?.[0]).toMatch(/already exists/i);
  });

  it("refuses an explicit slug that is already taken", async () => {
    const state = await categoryActions.createCategoryAction(
      INITIAL,
      form({ name: `${PREFIX} Another`, slug: `${PREFIX}-frontier-chronicles` }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.slug?.[0]).toMatch(/already in use/i);
  });

  it("rejects a blank name before touching the database", async () => {
    const state = await categoryActions.createCategoryAction(
      INITIAL,
      form({ name: "   " }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.name).toBeDefined();
  });

  it("updates a category and keeps the slug when it is left blank", async () => {
    const created = await prisma.category.create({
      data: { name: `${PREFIX} Keep Slug`, slug: `${PREFIX}-keep-slug` },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      categoryActions.updateCategoryAction(
        INITIAL,
        form({
          id: created.id,
          name: `${PREFIX} Keep Slug Renamed`,
          slug: "",
          description: "Updated.",
        }),
      ),
    );

    expect(url).toContain("notice=saved");

    const after = await prisma.category.findUnique({ where: { id: created.id } });
    expect(after?.name).toBe(`${PREFIX} Keep Slug Renamed`);
    expect(after?.slug).toBe(`${PREFIX}-keep-slug`);
    expect(after?.description).toBe("Updated.");
  });

  it("blocks deleting a category that still holds a story", async () => {
    const category = await prisma.category.create({
      data: { name: `${PREFIX} Occupied`, slug: `${PREFIX}-occupied` },
      select: { id: true },
    });

    await prisma.story.create({
      data: {
        title: `${PREFIX} Occupant`,
        slug: `${PREFIX}-occupant`,
        categoryId: category.id,
      },
    });

    const state = await categoryActions.deleteCategoryAction(
      INITIAL,
      form({ id: category.id, confirmation: `${PREFIX} Occupied` }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/still holds/i);

    const count = await prisma.category.count({ where: { id: category.id } });
    expect(count).toBe(1);
  });

  it("requires a matching typed confirmation to delete an empty category", async () => {
    const category = await prisma.category.create({
      data: { name: `${PREFIX} Deletable`, slug: `${PREFIX}-deletable` },
      select: { id: true },
    });

    const wrong = await categoryActions.deleteCategoryAction(
      INITIAL,
      form({ id: category.id, confirmation: "wrong" }),
    );
    expect(wrong.status).toBe("error");
    expect(wrong.fieldErrors?.confirmation).toBeDefined();

    const url = await expectRedirect(() =>
      categoryActions.deleteCategoryAction(
        INITIAL,
        form({ id: category.id, confirmation: `${PREFIX} Deletable` }),
      ),
    );
    expect(url).toContain("notice=deleted");

    const count = await prisma.category.count({ where: { id: category.id } });
    expect(count).toBe(0);
  });

  it("returns a safe error when the category is missing", async () => {
    const state = await categoryActions.updateCategoryAction(
      INITIAL,
      form({ id: "does-not-exist", name: `${PREFIX} Nope` }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toBeTruthy();
  });

  it("re-checks tags.manage before creating", async () => {
    vi.mocked(requireWriteCapability).mockClear();

    await expectRedirect(() =>
      tagActions.createTagAction(
        INITIAL,
        form({ name: `${PREFIX} Capability Tag` }),
      ),
    );

    expect(requireWriteCapability).toHaveBeenCalledWith("tags.manage");
  });

  it("creates a tag with a generated slug", async () => {
    const url = await expectRedirect(() =>
      tagActions.createTagAction(
        INITIAL,
        form({ name: `${PREFIX} Science Fiction` }),
      ),
    );

    expect(url).toContain("notice=created");
    const id = idFromEditUrl(url, "tags");

    const tag = await prisma.tag.findUnique({ where: { id } });
    expect(tag?.name).toBe(`${PREFIX} Science Fiction`);
    expect(tag?.slug).toBe(`${PREFIX}-science-fiction`);
  });

  it("refuses a duplicate tag name case-insensitively", async () => {
    const state = await tagActions.createTagAction(
      INITIAL,
      form({ name: `${PREFIX} SCIENCE FICTION` }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.name?.[0]).toMatch(/already exists/i);
  });

  it("renames a tag", async () => {
    const created = await prisma.tag.create({
      data: { name: `${PREFIX} Rename Me`, slug: `${PREFIX}-rename-me` },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      tagActions.updateTagAction(
        INITIAL,
        form({
          id: created.id,
          name: `${PREFIX} Renamed`,
          slug: `${PREFIX}-renamed`,
        }),
      ),
    );

    expect(url).toContain("notice=saved");

    const after = await prisma.tag.findUnique({ where: { id: created.id } });
    expect(after?.name).toBe(`${PREFIX} Renamed`);
    expect(after?.slug).toBe(`${PREFIX}-renamed`);
  });

  it("deletes a tag and cascades its story links without touching the story", async () => {
    const tag = await prisma.tag.create({
      data: { name: `${PREFIX} Cascade`, slug: `${PREFIX}-cascade` },
      select: { id: true },
    });
    const story = await prisma.story.create({
      data: {
        title: `${PREFIX} Cascade Story`,
        slug: `${PREFIX}-cascade-story`,
        storyTags: { create: [{ tagId: tag.id }] },
      },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      tagActions.deleteTagAction(
        INITIAL,
        form({ id: tag.id, confirmation: `${PREFIX} Cascade` }),
      ),
    );

    expect(url).toContain("notice=deleted");

    expect(await prisma.tag.count({ where: { id: tag.id } })).toBe(0);
    expect(
      await prisma.storyTag.count({ where: { tagId: tag.id } }),
    ).toBe(0);
    expect(await prisma.story.count({ where: { id: story.id } })).toBe(1);
  });
});
