/**
 * Pure chapter ordering helpers.
 *
 * Chapter rows carry the unique constraint `("storyId", "chapterNumber")`, so a
 * naive in-place swap of two numbers trips it mid-write. The strategy is
 * two-phase: shift every row of a story above all real values into a temporary
 * band, then write the final `1..n` sequence. Shifting by a constant larger
 * than any real number cannot collide with a not-yet-updated row, and the final
 * values are then free. These functions are deliberately free of the database
 * so the sequence logic can be unit-tested.
 * .agent/skills/chapter-management/SKILL.md.
 */
export const TEMPORARY_ORDER_OFFSET = 1_000_000;

/** The stored numbers form an unbroken `1..n` sequence. */
export function isContiguousOrder(numbers: readonly number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

export type PlanReorderResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate a reorder payload against the story's stored id set.
 *
 * The payload must be a permutation of exactly the stored ids: no missing id,
 * no duplicate, no foreign id. A mismatch is a typed error, never a silent
 * partial reorder.
 */
export function planReorder(
  currentIds: readonly string[],
  orderedIds: readonly string[],
): PlanReorderResult {
  if (orderedIds.length !== currentIds.length) {
    return {
      ok: false,
      error: "The chapter list changed. Reload and try again.",
    };
  }

  const current = new Set(currentIds);
  if (current.size !== currentIds.length) {
    return { ok: false, error: "The chapter list is inconsistent." };
  }

  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!current.has(id) || seen.has(id)) {
      return {
        ok: false,
        error: "The chapter list changed. Reload and try again.",
      };
    }
    seen.add(id);
  }

  return { ok: true };
}

/**
 * Move one chapter to a 1-based position, returning the full new order.
 *
 * `targetNumber` is clamped into `[1, length]`, so a stale or out-of-range
 * request moves the chapter to the nearest valid end rather than producing a
 * gap. An unknown id leaves the order unchanged.
 */
export function moveChapter(
  currentIds: readonly string[],
  chapterId: string,
  targetNumber: number,
): string[] {
  const index = currentIds.indexOf(chapterId);
  if (index < 0) {
    return [...currentIds];
  }

  const rest = currentIds.filter((id) => id !== chapterId);
  const target = Math.min(Math.max(Math.trunc(targetNumber), 1), rest.length + 1);
  rest.splice(target - 1, 0, chapterId);
  return rest;
}

/**
 * The temporary value a chapter is shifted to before its final number is
 * written. Exposed for the unit test that proves the band cannot collide with
 * a real value for a story of the maximum supported size.
 */
export function temporaryOrderValue(chapterNumber: number): number {
  return chapterNumber + TEMPORARY_ORDER_OFFSET;
}
