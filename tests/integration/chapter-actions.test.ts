import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Chapter mutations against a real PostgreSQL database.
 *
 * Skipped unless `DATABASE_URL` is set. `next/navigation` is stubbed so a
 * successful action's `redirect` surfaces as a thrown signal we can read, the
 * capability guard is mocked to a real admin, and `next/cache` is stubbed so
 * the action's cache invalidation never needs a request context. The database is
 * real, so the unique constraint `("storyId", "chapterNumber")`, serializable
 * reorder transactions and XSS sanitization are all exercised for real.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itchapteract-${process.pid}`;

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
import { INITIAL_CHAPTER_FORM_STATE } from "@/lib/chapters/form";

type ActionsModule = typeof import("@/actions/chapter");
type ChapterReaderModule = typeof import("@/lib/queries/public/chapters");

const INITIAL = INITIAL_CHAPTER_FORM_STATE;

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

/** Resolve either a redirect (success) or a returned state (failure). */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    const result = await run();
    return `state:${(result as { status?: string }).status ?? "unknown"}`;
  } catch (error) {
    if (error instanceof RedirectError) {
      return `redirect:${error.url}`;
    }
    throw error;
  }
}

describe.skipIf(!hasDatabase)("chapter actions (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let actions: ActionsModule;
  let queryPublishedChapterReader: ChapterReaderModule["queryPublishedChapterReader"];
  let counter = 0;

  function unique(prefix: string): string {
    counter += 1;
    return `${PREFIX}-${prefix}-${counter}`;
  }

  async function makeStory(
    label: string,
    status: ContentStatus = ContentStatus.DRAFT,
  ) {
    const slug = unique(label);
    return prisma.story.create({
      data: {
        title: `${label} Story`,
        slug,
        status,
        publishedAt: status === ContentStatus.PUBLISHED ? new Date() : null,
      },
      select: { id: true, slug: true },
    });
  }

  async function makeChapter(
    storyId: string,
    chapterNumber: number,
    options: {
      title?: string;
      slug?: string;
      content?: string;
      status?: ContentStatus;
    } = {},
  ) {
    const slug = options.slug ?? unique("chapter");
    return prisma.chapter.create({
      data: {
        storyId,
        chapterNumber,
        title: options.title ?? `Chapter ${chapterNumber}`,
        slug,
        content: options.content ?? `<p>Body ${chapterNumber}.</p>`,
        status: options.status ?? ContentStatus.DRAFT,
        publishedAt:
          options.status === ContentStatus.PUBLISHED ? new Date() : null,
      },
      select: { id: true, slug: true, title: true },
    });
  }

  async function numbersOf(storyId: string): Promise<number[]> {
    const rows = await prisma.chapter.findMany({
      where: { storyId },
      orderBy: { chapterNumber: "asc" },
      select: { chapterNumber: true },
    });
    return rows.map((row) => row.chapterNumber);
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    actions = await import("@/actions/chapter");
    const reader = await import("@/lib/queries/public/chapters");
    queryPublishedChapterReader = reader.queryPublishedChapterReader;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("re-checks the chapters.manage capability on every mutation", async () => {
    vi.mocked(requireWriteCapability).mockClear();
    const story = await makeStory("capability");

    await expectRedirect(() =>
      actions.createChapterAction(
        INITIAL,
        form({ storyId: story.id, title: "Capability" }),
      ),
    );

    expect(requireWriteCapability).toHaveBeenCalledWith("chapters.manage");
  });

  it("appends chapters as drafts numbered 1, 2, 3", async () => {
    const story = await makeStory("append");

    await expectRedirect(() =>
      actions.createChapterAction(
        INITIAL,
        form({ storyId: story.id, title: "One", content: "<p>One.</p>" }),
      ),
    );
    await expectRedirect(() =>
      actions.createChapterAction(
        INITIAL,
        form({ storyId: story.id, title: "Two", content: "<p>Two.</p>" }),
      ),
    );
    await expectRedirect(() =>
      actions.createChapterAction(
        INITIAL,
        form({ storyId: story.id, title: "Three", content: "<p>Three.</p>" }),
      ),
    );

    expect(await numbersOf(story.id)).toEqual([1, 2, 3]);
    const statuses = await prisma.chapter.findMany({
      where: { storyId: story.id },
      select: { status: true },
    });
    expect(statuses.every((row) => row.status === ContentStatus.DRAFT)).toBe(
      true,
    );
  });

  it("scopes slug uniqueness to the story", async () => {
    const storyA = await makeStory("slug-a");
    const storyB = await makeStory("slug-b");
    const slug = unique("shared");

    await expectRedirect(() =>
      actions.createChapterAction(
        INITIAL,
        form({ storyId: storyA.id, title: "Shared A", slug }),
      ),
    );

    // The same slug in another story is fine.
    await expectRedirect(() =>
      actions.createChapterAction(
        INITIAL,
        form({ storyId: storyB.id, title: "Shared B", slug }),
      ),
    );

    const blocked = await actions.createChapterAction(
      INITIAL,
      form({ storyId: storyA.id, title: "Shared A Again", slug }),
    );
    expect(blocked.status).toBe("error");
    expect(blocked.fieldErrors?.slug?.[0]).toMatch(/already in use/i);
  });

  it("rejects invalid input before touching the database", async () => {
    const story = await makeStory("invalid");
    const state = await actions.createChapterAction(
      INITIAL,
      form({ storyId: story.id, title: "   " }),
    );
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.title).toBeDefined();
  });

  it("saves edits and sanitizes stored content", async () => {
    const story = await makeStory("edit");
    const chapter = await makeChapter(story.id, 1, { title: "Original" });

    const url = await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "Edited",
          content:
            "<p>Hello</p><script>alert(1)</script><img src=\"x\" onerror=\"alert(1)\">",
        }),
      ),
    );
    expect(url).toContain("notice=saved");

    const after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { title: true, content: true },
    });
    expect(after?.title).toBe("Edited");
    expect(after?.content).toContain("<p>Hello</p>");
    expect(after?.content).not.toContain("<script>");
    expect(after?.content).not.toContain("onerror");
  });

  it("preserves formatting when editing an existing chapter", async () => {
    const story = await makeStory("edit-formatting");
    const chapter = await makeChapter(story.id, 1, {
      title: "First",
      content: "<p>Opening line.</p>",
    });

    const formatted =
      "<h2>The crossing</h2>" +
      "<p><strong>Night fell</strong> and the <em>lamp</em> went out.</p>" +
      '<p style="text-align:center">Meanwhile</p>' +
      "<ul><li>First watch</li><li>Second watch</li></ul>" +
      "<ol><li>Row</li><li>Rest</li></ol>" +
      "<blockquote>Hold fast.</blockquote>" +
      '<p><a href="https://example.test/log" rel="noopener noreferrer">the log</a></p>' +
      "<hr>" +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(1)">bad link</a>';

    const url = await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "First",
          content: formatted,
        }),
      ),
    );
    expect(url).toContain("notice=saved");

    const after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { content: true },
    });
    const stored = after?.content ?? "";

    // Every block the editor produced round-trips intact…
    expect(stored).toContain("<h2>The crossing</h2>");
    expect(stored).toContain("<strong>Night fell</strong>");
    expect(stored).toContain("<em>lamp</em>");
    expect(stored).toContain('<p style="text-align:center">Meanwhile</p>');
    expect(stored).toContain(
      "<ul><li>First watch</li><li>Second watch</li></ul>",
    );
    expect(stored).toContain("<ol><li>Row</li><li>Rest</li></ol>");
    expect(stored).toContain("<blockquote>Hold fast.</blockquote>");
    expect(stored).toContain('<a href="https://example.test/log"');
    expect(stored).toContain('rel="noopener noreferrer"');
    expect(stored).toContain("<hr");

    // …and the hostile payloads injected alongside it do not.
    expect(stored).not.toContain("<script");
    expect(stored).not.toContain("alert(1)");
    expect(stored).not.toContain("javascript:");

    // Re-saving the stored markup is a no-op: the sanitizer is idempotent, so
    // opening an already-published chapter and saving it unchanged cannot
    // gradually rewrite the document.
    await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "First",
          content: stored,
        }),
      ),
    );
    const resaved = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { content: true },
    });
    expect(resaved?.content).toBe(stored);
  });

  it("rejects a publish intent on empty content", async () => {
    const story = await makeStory("empty-publish");
    const chapter = await makeChapter(story.id, 1, { content: "<p></p>" });

    const state = await actions.updateChapterAction(
      INITIAL,
      form({
        storyId: story.id,
        id: chapter.id,
        title: "Empty",
        content: "<p>   </p>",
        intent: "publish",
      }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.content).toBeDefined();

    const after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { status: true },
    });
    expect(after?.status).toBe(ContentStatus.DRAFT);
  });

  it("publishes and unpublishes through the intent form", async () => {
    const story = await makeStory("intent-status");
    const chapter = await makeChapter(story.id, 1, {
      content: "<p>Live text.</p>",
    });

    const publishUrl = await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "Live",
          content: "<p>Live text.</p>",
          intent: "publish",
        }),
      ),
    );
    expect(publishUrl).toContain("notice=published");

    let after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { status: true, publishedAt: true },
    });
    expect(after?.status).toBe(ContentStatus.PUBLISHED);
    const firstPublishedAt = after?.publishedAt;
    expect(firstPublishedAt).not.toBeNull();

    const unpublishUrl = await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "Live",
          content: "<p>Live text.</p>",
          intent: "unpublish",
        }),
      ),
    );
    expect(unpublishUrl).toContain("notice=unpublished");

    after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { status: true, publishedAt: true },
    });
    expect(after?.status).toBe(ContentStatus.DRAFT);
    // Unpublishing never nulls the original publication date.
    expect(after?.publishedAt?.getTime()).toBe(firstPublishedAt?.getTime());
  });

  it("requires confirmation before renaming a published chapter's slug", async () => {
    const story = await makeStory("published-rename");
    const chapter = await makeChapter(story.id, 1, {
      status: ContentStatus.PUBLISHED,
    });

    const blocked = await actions.updateChapterAction(
      INITIAL,
      form({
        storyId: story.id,
        id: chapter.id,
        title: "Renamed",
        slug: unique("renamed"),
      }),
    );
    expect(blocked.status).toBe("error");
    expect(blocked.fieldErrors?.confirmSlugChange).toBeDefined();

    const target = unique("renamed-ok");
    await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "Renamed",
          slug: target,
          confirmSlugChange: "on",
        }),
      ),
    );

    const after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { slug: true },
    });
    expect(after?.slug).toBe(target);
  });

  it("reorders to 3, 1, 2 and stores a contiguous, unique sequence", async () => {
    const story = await makeStory("reorder");
    const one = await makeChapter(story.id, 1);
    const two = await makeChapter(story.id, 2);
    const three = await makeChapter(story.id, 3);

    const url = await expectRedirect(() =>
      actions.reorderChaptersAction(
        INITIAL,
        form({ storyId: story.id, order: [three.id, one.id, two.id] }),
      ),
    );
    expect(url).toContain("notice=reordered");

    const rows = await prisma.chapter.findMany({
      where: { storyId: story.id },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true },
    });
    expect(rows.map((row) => row.id)).toEqual([three.id, one.id, two.id]);
    expect(rows.map((row) => row.chapterNumber)).toEqual([1, 2, 3]);
  });

  it("rejects a reorder payload missing an id and leaves the data unchanged", async () => {
    const story = await makeStory("reorder-missing");
    const one = await makeChapter(story.id, 1);
    await makeChapter(story.id, 2);
    await makeChapter(story.id, 3);

    const state = await actions.reorderChaptersAction(
      INITIAL,
      form({ storyId: story.id, order: [one.id, one.id] }),
    );
    expect(state.status).toBe("error");

    expect(await numbersOf(story.id)).toEqual([1, 2, 3]);
  });

  it("keeps a contiguous sequence under two concurrent reorders", async () => {
    const story = await makeStory("reorder-concurrent");
    const one = await makeChapter(story.id, 1);
    const two = await makeChapter(story.id, 2);
    const three = await makeChapter(story.id, 3);

    const results = await Promise.all([
      outcome(() =>
        actions.reorderChaptersAction(
          INITIAL,
          form({ storyId: story.id, order: [three.id, one.id, two.id] }),
        ),
      ),
      outcome(() =>
        actions.reorderChaptersAction(
          INITIAL,
          form({ storyId: story.id, order: [two.id, three.id, one.id] }),
        ),
      ),
    ]);

    // At least one must have succeeded, and the final state must be valid
    // regardless of how the serialized transactions interleaved.
    expect(results.some((result) => result.startsWith("redirect:"))).toBe(true);
    expect(await numbersOf(story.id)).toEqual([1, 2, 3]);
  });

  it("renumbers contiguously when the middle chapter is deleted", async () => {
    const story = await makeStory("delete-middle");
    const one = await makeChapter(story.id, 1, { title: "Keep One" });
    const middle = await makeChapter(story.id, 2, { title: "Remove Me" });
    const three = await makeChapter(story.id, 3, { title: "Keep Three" });

    const url = await expectRedirect(() =>
      actions.deleteChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: middle.id,
          confirmation: "Remove Me",
        }),
      ),
    );
    expect(url).toContain("notice=deleted");

    const rows = await prisma.chapter.findMany({
      where: { storyId: story.id },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true },
    });
    expect(rows.map((row) => row.id)).toEqual([one.id, three.id]);
    expect(rows.map((row) => row.chapterNumber)).toEqual([1, 2]);
  });

  it("deletes the last published chapter of a published story with the normal notice", async () => {
    const story = await makeStory("delete-last", ContentStatus.PUBLISHED);
    const chapter = await makeChapter(story.id, 1, {
      title: "Only Live",
      status: ContentStatus.PUBLISHED,
    });

    const url = await expectRedirect(() =>
      actions.deleteChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          confirmation: "Only Live",
        }),
      ),
    );
    expect(url).toContain("notice=deleted");
  });

  it("requires the exact title to delete", async () => {
    const story = await makeStory("delete-confirm");
    const chapter = await makeChapter(story.id, 1, { title: "Exact Title" });

    const wrong = await actions.deleteChapterAction(
      INITIAL,
      form({ storyId: story.id, id: chapter.id, confirmation: "wrong" }),
    );
    expect(wrong.status).toBe("error");
    expect(wrong.fieldErrors?.confirmation).toBeDefined();

    const count = await prisma.chapter.count({ where: { id: chapter.id } });
    expect(count).toBe(1);
  });

  it("changes a chapter's position through the edit form, leaving no gap", async () => {
    const story = await makeStory("move-position");
    const one = await makeChapter(story.id, 1, { title: "First" });
    const two = await makeChapter(story.id, 2, { title: "Second" });
    const three = await makeChapter(story.id, 3, { title: "Third" });

    await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: one.id,
          title: "First",
          chapterNumber: "3",
        }),
      ),
    );

    const rows = await prisma.chapter.findMany({
      where: { storyId: story.id },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true },
    });
    expect(rows.map((row) => row.id)).toEqual([two.id, three.id, one.id]);
    expect(rows.map((row) => row.chapterNumber)).toEqual([1, 2, 3]);
  });

  it("reflects publish and unpublish in the public reader", async () => {
    const story = await makeStory("visibility", ContentStatus.PUBLISHED);
    const chapter = await makeChapter(story.id, 1, { content: "<p>Hidden.</p>" });

    await expect(
      queryPublishedChapterReader(story.slug, chapter.slug),
    ).resolves.toBeNull();

    await expectRedirect(() =>
      actions.publishChapterAction(
        INITIAL,
        form({ storyId: story.id, id: chapter.id }),
      ),
    );
    const reader = await queryPublishedChapterReader(story.slug, chapter.slug);
    expect(reader?.chapter.title).toBe(chapter.title);

    await expectRedirect(() =>
      actions.unpublishChapterAction(
        INITIAL,
        form({ storyId: story.id, id: chapter.id }),
      ),
    );
    await expect(
      queryPublishedChapterReader(story.slug, chapter.slug),
    ).resolves.toBeNull();
  });

  it("rejects publishing an empty chapter through the status action", async () => {
    const story = await makeStory("publish-empty");
    const chapter = await makeChapter(story.id, 1, { content: "<p></p>" });

    const state = await actions.publishChapterAction(
      INITIAL,
      form({ storyId: story.id, id: chapter.id }),
    );
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.content).toBeDefined();
  });

  it("treats an unknown intent as a plain save", async () => {
    const story = await makeStory("unknown-intent");
    const chapter = await makeChapter(story.id, 1, { title: "Before" });

    const url = await expectRedirect(() =>
      actions.updateChapterAction(
        INITIAL,
        form({
          storyId: story.id,
          id: chapter.id,
          title: "After",
          content: "<p>After.</p>",
          intent: "delete-everything",
        }),
      ),
    );
    expect(url).toContain("notice=saved");

    const after = await prisma.chapter.findUnique({
      where: { id: chapter.id },
      select: { title: true, status: true },
    });
    expect(after?.title).toBe("After");
    expect(after?.status).toBe(ContentStatus.DRAFT);
  });

  it("cannot mutate a chapter through another story's id (IDOR)", async () => {
    const storyA = await makeStory("idor-a");
    const storyB = await makeStory("idor-b");
    const foreign = await makeChapter(storyB.id, 1, { title: "Foreign" });

    const state = await actions.updateChapterAction(
      INITIAL,
      form({
        storyId: storyA.id,
        id: foreign.id,
        title: "Hijacked",
        content: "<p>Hijacked.</p>",
      }),
    );
    expect(state.status).toBe("error");

    const after = await prisma.chapter.findUnique({
      where: { id: foreign.id },
      select: { title: true },
    });
    expect(after?.title).toBe("Foreign");
  });
});
