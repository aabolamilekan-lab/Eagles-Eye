/**
 * State returned to the story form by its Server Actions.
 *
 * A `"use server"` module may only export async functions, so this shape lives
 * in a plain module. Success is conveyed by a server redirect and a `notice`
 * query parameter; this state carries only actionable failures.
 */
export interface StoryFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const INITIAL_STORY_FORM_STATE: StoryFormState = { status: "idle" };
