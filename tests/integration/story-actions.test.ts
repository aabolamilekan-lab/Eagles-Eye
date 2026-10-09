import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Story mutations against a real PostgreSQL database.
 *
 * Skipped unless `DATABASE_URL` is set. `next/navigation` is stubbed so a
 * successful action's `redirect` surfaces as a thrown signal we can read, the
 * capability guard is mocked to a real admin, and `next/cache` is stubbed so the
 * action's `updateTag`/`revalidatePath` never needs a request context. The
 * database itself is real, so transactions, cascades and unique constraints are
 * exercised for real.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itstory-${process.pid}`;

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
import type { StoryFormState } from "@/lib/stories/form";
import { INITIAL_STORY_FORM_STATE } from "@/lib/stories/form";

type ActionsModule = typeof import("@/actions/story");

const INITIAL = INITIAL_STORY_FORM_STATE;

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

function storyIdFromEditUrl(url: string): string {
  const match = /^\/admin\/stories\/([^/]+)\/edit/.exec(url);
  const id = match?.[1];
  if (!id) {
    throw new Error(`unexpected redirect: ${url}`);
  }
  return id;
}

describe.skipIf(!hasDatabase)("story actions (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let actions: ActionsModule;
  let categoryId = "";
  let tagA = "";
  let tagB = "";

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    actions = await import("@/actions/story");

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: PREFIX } },
    });

    const category = await prisma.category.create({
      data: { name: "Action Category", slug: `${PREFIX}-cat` },
      select: { id: true },
    });
    categoryId = category.id;

    const a = await prisma.tag.create({
      data: { name: "Action A", slug: `${PREFIX}-a` },
      select: { id: true },
    });
    const b = await prisma.tag.create({
      data: { name: "Action B", slug: `${PREFIX}-b` },
      select: { id: true },
    });
    tagA = a.id;
    tagB = b.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: PREFIX } },
    });
    await prisma.$disconnect();
  });

  it("re-checks the stories.manage capability on every mutation", async () => {
    vi.mocked(requireWriteCapability).mockClear();

    await expectRedirect(() =>
      actions.createStoryAction(
        INITIAL,
        form({ title: `${PREFIX} Capability Check` }),
      ),
    );

    expect(requireWriteCapability).toHaveBeenCalledWith("stories.manage");
  });

  it("creates a draft with a generated slug, sanitized body and tag links", async () => {
    const url = await expectRedirect(() =>
      actions.createStoryAction(
        INITIAL,
        form({
          title: `${PREFIX} The First Action Story`,
          author: "A. Writer",
          shortDescription: "A short plain summary.",
          description: "<p>Hello</p><script>alert(1)</script>",
          coverImage: "covers/2026/10/11111111-1111-1111-1111-111111111111.webp",
          categoryId,
          tagIds: [tagA, tagB],
        }),
      ),
    );

    const id = storyIdFromEditUrl(url);
    expect(url).toContain("notice=created");

    const story = await prisma.story.findUnique({
      where: { id },
      include: { storyTags: true },
    });

    expect(story).not.toBeNull();
    expect(story?.status).toBe(ContentStatus.DRAFT);
    expect(story?.slug).toBe(`${PREFIX}-the-first-action-story`);
    expect(story?.description).not.toContain("<script>");
    expect(story?.description).toContain("<p>Hello</p>");
    expect(story?.categoryId).toBe(categoryId);
    expect(story?.storyTags).toHaveLength(2);
  });

  it("refuses an explicit slug that is already taken", async () => {
    await prisma.story.create({
      data: { title: "Taken", slug: `${PREFIX}-taken` },
    });

    const state = await actions.createStoryAction(
      INITIAL,
      form({ title: "Another", slug: `${PREFIX}-taken` }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.slug?.[0]).toMatch(/already in use/i);
  });

  it("rejects invalid input before touching the database", async () => {
    const state = await actions.createStoryAction(
      INITIAL,
      form({ title: "   " }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.title).toBeDefined();
  });

  it("saves edits and replaces tags in one transaction", async () => {
    const created = await prisma.story.create({
      data: {
        title: "Editable",
        slug: `${PREFIX}-editable`,
        storyTags: { create: [{ tagId: tagA }] },
      },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      actions.updateStoryAction(
        INITIAL,
        form({
          id: created.id,
          title: "Edited Title",
          slug: `${PREFIX}-editable-renamed`,
          author: "New Author",
          description: "<p>Updated</p>",
          tagIds: [tagB],
        }),
      ),
    );

    expect(url).toContain("notice=saved");

    const story = await prisma.story.findUnique({
      where: { id: created.id },
      include: { storyTags: true },
    });

    expect(story?.title).toBe("Edited Title");
    expect(story?.slug).toBe(`${PREFIX}-editable-renamed`);
    expect(story?.author).toBe("New Author");
    expect(story?.storyTags.map((entry) => entry.tagId)).toEqual([tagB]);
  });

  it("requires confirmation before renaming a published story's slug", async () => {
    const published = await prisma.story.create({
      data: {
        title: "Published Rename",
        slug: `${PREFIX}-published-rename`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    const blocked = await actions.updateStoryAction(
      INITIAL,
      form({
        id: published.id,
        title: "Published Rename",
        slug: `${PREFIX}-published-rename-2`,
      }),
    );
    expect(blocked.status).toBe("error");
    expect(blocked.fieldErrors?.confirmSlugChange).toBeDefined();

    await expectRedirect(() =>
      actions.updateStoryAction(
        INITIAL,
        form({
          id: published.id,
          title: "Published Rename",
          slug: `${PREFIX}-published-rename-2`,
          confirmSlugChange: "on",
        }),
      ),
    );

    const story = await prisma.story.findUnique({
      where: { id: published.id },
      select: { slug: true },
    });
    expect(story?.slug).toBe(`${PREFIX}-published-rename-2`);
  });

  it("publishes a draft with no published chapter using the normal notice", async () => {
    const story = await prisma.story.create({
      data: { title: "Draft To Publish", slug: `${PREFIX}-publish-empty` },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      actions.publishStoryAction(INITIAL, form({ id: story.id })),
    );

    expect(url).toContain("notice=published");

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      select: { status: true, publishedAt: true },
    });
    expect(after?.status).toBe(ContentStatus.PUBLISHED);
    expect(after?.publishedAt).not.toBeNull();
  });

  it("publishes with the normal notice when a published chapter exists", async () => {
    const story = await prisma.story.create({
      data: {
        title: "Draft With Chapter",
        slug: `${PREFIX}-publish-full`,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "One",
              slug: `${PREFIX}-publish-full-1`,
              content: "<p>One.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date(),
            },
          ],
        },
      },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      actions.publishStoryAction(INITIAL, form({ id: story.id })),
    );

    expect(url).toContain("notice=published");
  });

  it("rejects a transition that is illegal for the current status", async () => {
    const story = await prisma.story.create({
      data: {
        title: "Already Published",
        slug: `${PREFIX}-already`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    const state = await actions.publishStoryAction(
      INITIAL,
      form({ id: story.id }),
    );

    expect(state.status).toBe("error");
  });

  it("unpublishes a published story back to draft", async () => {
    const story = await prisma.story.create({
      data: {
        title: "To Unpublish",
        slug: `${PREFIX}-unpublish`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    await expectRedirect(() =>
      actions.unpublishStoryAction(INITIAL, form({ id: story.id })),
    );

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      select: { status: true },
    });
    expect(after?.status).toBe(ContentStatus.DRAFT);
  });

  it("archives a published story and its published chapters atomically", async () => {
    const story = await prisma.story.create({
      data: {
        title: "To Archive",
        slug: `${PREFIX}-archive`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Live",
              slug: `${PREFIX}-archive-1`,
              content: "<p>Live.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date(),
            },
            {
              chapterNumber: 2,
              title: "Draft",
              slug: `${PREFIX}-archive-2`,
              content: "<p>Draft.</p>",
              status: ContentStatus.DRAFT,
            },
          ],
        },
      },
      select: { id: true },
    });

    await expectRedirect(() =>
      actions.archiveStoryAction(INITIAL, form({ id: story.id })),
    );

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      include: { chapters: { orderBy: { chapterNumber: "asc" } } },
    });

    expect(after?.status).toBe(ContentStatus.ARCHIVED);
    expect(after?.chapters[0]?.status).toBe(ContentStatus.ARCHIVED);
    expect(after?.chapters[1]?.status).toBe(ContentStatus.DRAFT);
  });

  it("restores an archived story to draft", async () => {
    const story = await prisma.story.create({
      data: {
        title: "To Restore",
        slug: `${PREFIX}-restore`,
        status: ContentStatus.ARCHIVED,
      },
      select: { id: true },
    });

    await expectRedirect(() =>
      actions.restoreStoryAction(INITIAL, form({ id: story.id })),
    );

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      select: { status: true },
    });
    expect(after?.status).toBe(ContentStatus.DRAFT);
  });

  it("features only a published story", async () => {
    const draft = await prisma.story.create({
      data: { title: "Feature Draft", slug: `${PREFIX}-feature-draft` },
      select: { id: true },
    });

    const blocked = await actions.setFeaturedAction(
      INITIAL,
      form({ id: draft.id, featured: "true" }),
    );
    expect(blocked.status).toBe("error");

    const published = await prisma.story.create({
      data: {
        title: "Feature Published",
        slug: `${PREFIX}-feature-published`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    await expectRedirect(() =>
      actions.setFeaturedAction(
        INITIAL,
        form({ id: published.id, featured: "true" }),
      ),
    );

    const after = await prisma.story.findUnique({
      where: { id: published.id },
      select: { featured: true },
    });
    expect(after?.featured).toBe(true);
  });

  it("deletes only when the typed title matches, then cascades", async () => {
    const story = await prisma.story.create({
      data: {
        title: "Delete Me",
        slug: `${PREFIX}-delete`,
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Gone",
              slug: `${PREFIX}-delete-1`,
              content: "<p>Gone.</p>",
            },
          ],
        },
        storyTags: { create: [{ tagId: tagA }] },
      },
      select: { id: true },
    });

    const wrong = await actions.deleteStoryAction(
      INITIAL,
      form({ id: story.id, confirmation: "wrong" }),
    );
    expect(wrong.status).toBe("error");
    expect(wrong.fieldErrors?.confirmation).toBeDefined();

    const url = await expectRedirect(() =>
      actions.deleteStoryAction(
        INITIAL,
        form({ id: story.id, confirmation: "Delete Me" }),
      ),
    );
    expect(url).toContain("notice=deleted");

    const count = await prisma.story.count({ where: { id: story.id } });
    expect(count).toBe(0);

    const chapters = await prisma.chapter.count({
      where: { storyId: story.id },
    });
    expect(chapters).toBe(0);
  });

  it("returns a safe error when the story is missing", async () => {
    const state = await actions.updateStoryAction(
      INITIAL,
      form({ id: "does-not-exist", title: "Nope" }),
    );

    expect(state.status).toBe("error");
    expect((state as StoryFormState).message).toBeTruthy();
  });

  it("publishes on create when the publish intent is submitted", async () => {
    const url = await expectRedirect(() =>
      actions.createStoryAction(
        INITIAL,
        form({ title: `${PREFIX} Publish On Create`, intent: "publish" }),
      ),
    );

    expect(url).toContain("notice=published");

    const after = await prisma.story.findUnique({
      where: { id: storyIdFromEditUrl(url) },
      select: { status: true, publishedAt: true },
    });
    expect(after?.status).toBe(ContentStatus.PUBLISHED);
    expect(after?.publishedAt).not.toBeNull();
  });

  it("saves content and archives in the same intent submit", async () => {
    const story = await prisma.story.create({
      data: {
        title: "Intent Archive",
        slug: `${PREFIX}-intent-archive`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Live",
              slug: `${PREFIX}-intent-archive-1`,
              content: "<p>Live.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date(),
            },
          ],
        },
      },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      actions.updateStoryAction(
        INITIAL,
        form({
          id: story.id,
          title: "Intent Archive Edited",
          slug: `${PREFIX}-intent-archive`,
          intent: "archive",
        }),
      ),
    );

    expect(url).toContain("notice=archived");

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      include: { chapters: true },
    });
    expect(after?.title).toBe("Intent Archive Edited");
    expect(after?.status).toBe(ContentStatus.ARCHIVED);
    expect(after?.chapters[0]?.status).toBe(ContentStatus.ARCHIVED);
  });

  it("features a published story in the same submit as a content save", async () => {
    const story = await prisma.story.create({
      data: {
        title: "Intent Feature",
        slug: `${PREFIX}-intent-feature`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      actions.updateStoryAction(
        INITIAL,
        form({
          id: story.id,
          title: "Intent Feature Edited",
          slug: `${PREFIX}-intent-feature`,
          intent: "feature",
        }),
      ),
    );

    expect(url).toContain("notice=featured");

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      select: { featured: true, title: true },
    });
    expect(after?.featured).toBe(true);
    expect(after?.title).toBe("Intent Feature Edited");
  });

  it("rejects an illegal intent without saving the content", async () => {
    const story = await prisma.story.create({
      data: {
        title: "Intent Illegal",
        slug: `${PREFIX}-intent-illegal`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    const state = await actions.updateStoryAction(
      INITIAL,
      form({
        id: story.id,
        title: "Should Not Persist",
        slug: `${PREFIX}-intent-illegal`,
        intent: "publish",
      }),
    );

    expect(state.status).toBe("error");

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      select: { title: true, status: true },
    });
    expect(after?.title).toBe("Intent Illegal");
    expect(after?.status).toBe(ContentStatus.PUBLISHED);
  });

  it("treats an unknown intent as a plain save", async () => {
    const story = await prisma.story.create({
      data: { title: "Intent Unknown", slug: `${PREFIX}-intent-unknown` },
      select: { id: true },
    });

    const url = await expectRedirect(() =>
      actions.updateStoryAction(
        INITIAL,
        form({
          id: story.id,
          title: "Intent Unknown Edited",
          slug: `${PREFIX}-intent-unknown`,
          intent: "delete-everything",
        }),
      ),
    );

    expect(url).toContain("notice=saved");

    const after = await prisma.story.findUnique({
      where: { id: story.id },
      select: { status: true, title: true },
    });
    expect(after?.status).toBe(ContentStatus.DRAFT);
    expect(after?.title).toBe("Intent Unknown Edited");
  });
});
