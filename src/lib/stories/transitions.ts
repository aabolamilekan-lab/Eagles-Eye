import { ContentStatus } from "@prisma/client";

/**
 * The story publish state machine.
 *
 * These are the only legal transitions. Encoding them here — as a pure table —
 * means no call site can half-publish a story or archive a draft by accident,
 * and the rules can be unit-tested without a database.
 * .agent/skills/story-management/SKILL.md.
 */
export type StoryStatusAction =
  | "publish"
  | "unpublish"
  | "archive"
  | "restore"
  | "delete";

interface TransitionRule {
  from: readonly ContentStatus[];
  /** Destination status, or `null` when the row is removed. */
  to: ContentStatus | null;
}

const RULES: Record<StoryStatusAction, TransitionRule> = {
  publish: {
    from: [ContentStatus.DRAFT],
    to: ContentStatus.PUBLISHED,
  },
  unpublish: {
    from: [ContentStatus.PUBLISHED],
    to: ContentStatus.DRAFT,
  },
  archive: {
    from: [ContentStatus.PUBLISHED],
    to: ContentStatus.ARCHIVED,
  },
  restore: {
    from: [ContentStatus.ARCHIVED],
    to: ContentStatus.DRAFT,
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

/** Is `action` legal from the story's current status? */
export function isStatusTransitionAllowed(
  current: ContentStatus,
  action: StoryStatusAction,
): boolean {
  return RULES[action].from.includes(current);
}

/**
 * The status a story moves to, or `null` when the transition is illegal.
 * `delete` reports `null` in both the legal (removed) and illegal cases, so
 * callers gate destructive actions on `isStatusTransitionAllowed` instead.
 */
export function statusAfter(
  current: ContentStatus,
  action: Exclude<StoryStatusAction, "delete">,
): ContentStatus | null {
  return isStatusTransitionAllowed(current, action) ? RULES[action].to : null;
}

/** Featuring is a public read; only a published story may be featured. */
export function canFeature(current: ContentStatus): boolean {
  return current === ContentStatus.PUBLISHED;
}
