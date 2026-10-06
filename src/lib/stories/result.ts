/**
 * Typed result for story Server Actions.
 *
 * A `"use server"` module may only export async functions, so this type and its
 * helpers live in a plain module and are imported by the actions. An action
 * never throws a Prisma or domain error at a caller: it returns one of these.
 * AGENTS.md section 13; .agent/skills/story-management/SKILL.md.
 */
export type ActionResult<TData = undefined> =
  | { ok: true; data: TData }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionOk<TData>(data: TData): ActionResult<TData> {
  return { ok: true, data };
}

export function actionFail<TData = undefined>(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<TData> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}
