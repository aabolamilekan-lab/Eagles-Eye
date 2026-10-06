import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentStatus, type PrismaClient } from "@prisma/client";

/**
 * Admin dashboard against a real PostgreSQL database.
 *
 * Skipped unless `DATABASE_URL` is set. Global totals are asserted as deltas so
 * the test is independent of whatever else is in the database. The year window
 * is pinned to a far-future year no seed or other suite writes to, so those
 * counts are exact. Every row is namespaced by process id and removed after.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PREFIX = `itadmin-${process.pid}`;
const YEAR = 2093;

type StatsModule = typeof import("@/lib/queries/admin/stats");

describe.skipIf(!hasDatabase)("admin dashboard (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let getAdminDashboard: StatsModule["getAdminDashboard"];
  let before: Awaited<ReturnType<StatsModule["getAdminDashboard"]>>;
  let publishedStoryId = "";
  let viewId = "";

  const now = new Date(`${YEAR}-06-01T00:00:00.000Z`);

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;

    const stats = await import("@/lib/queries/admin/stats");
    getAdminDashboard = stats.getAdminDashboard;

    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });

    before = await getAdminDashboard(now);

    const story = await prisma.story.create({
      data: {
        title: "Dashboard Published",
        slug: `${PREFIX}-published`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(`${YEAR}-01-10T00:00:00.000Z`),
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "One",
              slug: `${PREFIX}-published-1`,
              content: "<p>One.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date(`${YEAR}-01-10T01:00:00.000Z`),
            },
            {
              chapterNumber: 2,
              title: "Two",
              slug: `${PREFIX}-published-2`,
              content: "<p>Two.</p>",
              status: ContentStatus.DRAFT,
            },
            {
              chapterNumber: 3,
              title: "Three",
              slug: `${PREFIX}-published-3`,
              content: "<p>Three.</p>",
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date(`${YEAR}-01-12T00:00:00.000Z`),
            },
          ],
        },
      },
      select: { id: true },
    });
    publishedStoryId = story.id;

    await prisma.story.create({
      data: {
        title: "Dashboard Unreadable",
        slug: `${PREFIX}-unreadable`,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(`${YEAR}-02-01T00:00:00.000Z`),
        chapters: {
          create: [
            {
              chapterNumber: 1,
              title: "Hidden",
              slug: `${PREFIX}-unreadable-1`,
              content: "<p>Hidden.</p>",
              status: ContentStatus.DRAFT,
            },
          ],
        },
      },
    });

    const view = await prisma.storyView.create({
      data: {
        storyId: story.id,
        sessionId: `${PREFIX}-v1`,
        viewedAt: new Date(`${YEAR}-03-05T09:00:00.000Z`),
      },
      select: { id: true },
    });
    viewId = view.id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.story.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("counts publication events inside the UTC year window", async () => {
    const after = await getAdminDashboard(now);

    expect(after.storiesPublishedThisYear).toBe(2);
    expect(after.chaptersPublishedThisYear).toBe(2);
  });

  it("reflects new stories and chapters in the status totals", async () => {
    const after = await getAdminDashboard(now);

    expect(after.stories.total - before.stories.total).toBe(2);
    expect(after.stories.published - before.stories.published).toBe(2);
    expect(after.chapters.total - before.chapters.total).toBe(4);
    expect(after.chapters.published - before.chapters.published).toBe(2);
  });

  it("flags a published story with no published chapter", async () => {
    const after = await getAdminDashboard(now);

    expect(after.storiesUnreadable - before.storiesUnreadable).toBe(1);
  });

  it("counts the recorded view and lists the newest first", async () => {
    const after = await getAdminDashboard(now);

    expect(after.recordedViews - before.recordedViews).toBe(1);
    expect(after.recentViews[0]?.id).toBe(viewId);
    expect(after.recentViews[0]?.story.id).toBe(publishedStoryId);
  });

  it("maps chapter counts without exceeding the total", async () => {
    const after = await getAdminDashboard(now);

    for (const story of after.recentStories) {
      expect(story.publishedChapterCount).toBeLessThanOrEqual(story.chapterCount);
    }
  });
});
