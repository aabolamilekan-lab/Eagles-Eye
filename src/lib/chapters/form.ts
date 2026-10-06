/**
 * State returned to the chapter form by its Server Actions.
 *
 * A `"use server"` module may only export async functions, so this shape lives
 * in a plain module. Success is conveyed by a server redirect and a `notice`
 * query parameter; this state carries only actionable failures.
 */
export interface ChapterFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const INITIAL_CHAPTER_FORM_STATE: ChapterFormState = { status: "idle" };
