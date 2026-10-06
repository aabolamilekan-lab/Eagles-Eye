import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Admin chapter reads.
 *
 * Deliberately uncached and status-agnostic: the admin surface must see drafts
 * and archived chapters, unlike `src/lib/queries/public/`. Every read is scoped
 * by the parent story id, so a bare chapter id is never enough to load a row.
 * `.agent/skills/chapter-management/SKILL.md`.
 */
export interface AdminChapterListRow {
  id: string;
  chapterNumber: number;
  title: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  views: number;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface AdminChapterListResult {
  chapters: AdminChapterListRow[];
  total: number;
  publishedCount: number;
}

const ADMIN_CHAPTER_LIST_SELECT = {
  id: true,
  chapterNumber: true,
  title: true,
  slug: true,
  status: true,
  views: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.ChapterSelect;

/** Every chapter of a story, in stored reading order. Never content bodies. */
export async function queryAdminChapterList(
  storyId: string,
): Promise<AdminChapterListResult> {
  const chapters = await prisma.chapter.findMany({
    where: { storyId },
    select: ADMIN_CHAPTER_LIST_SELECT,
    orderBy: [{ chapterNumber: "asc" }, { id: "asc" }],
  });

  return {
    chapters,
    total: chapters.length,
    publishedCount: chapters.filter(
      (chapter) => chapter.status === "PUBLISHED",
    ).length,
  };
}

export interface AdminChapterDetail {
  id: string;
  storyId: string;
  chapterNumber: number;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  views: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ADMIN_CHAPTER_DETAIL_SELECT = {
  id: true,
  storyId: true,
  chapterNumber: true,
  title: true,
  slug: true,
  content: true,
  status: true,
  views: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChapterSelect;

/**
 * One chapter, scoped to its story. Returns `null` when the id does not belong
 * to that story, so a mismatched pair is the same as an unknown chapter.
 */
export async function getAdminChapterById(
  storyId: string,
  chapterId: string,
): Promise<AdminChapterDetail | null> {
  const row: AdminChapterDetail | null = await prisma.chapter.findFirst({
    where: { id: chapterId, storyId },
    select: ADMIN_CHAPTER_DETAIL_SELECT,
  });

  return row;
}
