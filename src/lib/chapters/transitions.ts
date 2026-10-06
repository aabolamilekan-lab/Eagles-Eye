import { ContentStatus } from "@prisma/client";

/**
 * The chapter publish state machine.
 *
 * These are the only legal transitions. Encoding them as a pure table means no
 * call site can publish a chapter that has no body, restore an archived chapter
 * in a way that skips review, or archive a draft that was never visible. The
 * rules are unit-tested without a database.
 * .agent/skills/chapter-management/SKILL.md.
 */
export type ChapterStatusAction =
  | "publish"
  | "unpublish"
  | "archive"
  | "delete";

interface TransitionRule {
  from: readonly ContentStatus[];
  /** Destination status, or `null` when the row is removed. */
  to: ContentStatus | null;
}

const RULES: Record<ChapterStatusAction, TransitionRule> = {
  publish: {
    // An archived chapter is republished directly; there is no ARCHIVED -> DRAFT.
    from: [ContentStatus.DRAFT, ContentStatus.ARCHIVED],
    to: ContentStatus.PUBLISHED,
  },
  unpublish: {
    from: [ContentStatus.PUBLISHED],
    to: ContentStatus.DRAFT,
  },
  archive: {
    from: [ContentStatus.DRAFT, ContentStatus.PUBLISHED],
    to: ContentStatus.ARCHIVED,
  },
  delete: {
    from: [
      ContentStatus.DRAFT,
      ContentStatus.PUBLISHED,
      ContentStatus.ARCHIVED,
    ],
    to: null,
  },
};

/** Is `action` legal from the chapter's current status? */
export function isChapterTransitionAllowed(
  current: ContentStatus,
  action: ChapterStatusAction,
): boolean {
  return RULES[action].from.includes(current);
}

/**
 * The status a chapter moves to, or `null` when the transition is illegal.
 * `delete` reports `null` in both the legal (removed) and illegal cases, so
 * callers gate destructive actions on `isChapterTransitionAllowed` instead.
 */
export function chapterStatusAfter(
  current: ContentStatus,
  action: Exclude<ChapterStatusAction, "delete">,
): ContentStatus | null {
  return isChapterTransitionAllowed(current, action) ? RULES[action].to : null;
}
