import type { AlertTone } from "@/components/ui/Alert";

/**
 * Account settings form contract.
 *
 * A `"use server"` module may only export async functions, so the shape the
 * account forms share lives here in a plain module (the same split as
 * `src/lib/taxonomy/form.ts`). Success is carried by a redirect and a `notice`
 * query parameter; this state is only ever an actionable failure.
 */
export interface AccountFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const INITIAL_ACCOUNT_FORM_STATE: AccountFormState = { status: "idle" };

export interface AccountNotice {
  tone: AlertTone;
  title: string;
  message: string;
}

const NOTICES: Readonly<Record<string, AccountNotice>> = {
  profile_saved: {
    tone: "success",
    title: "Profile saved",
    message: "Your display name was updated.",
  },
  password_changed: {
    tone: "success",
    title: "Password changed",
    message:
      "Your other sessions were signed out. This device stays signed in.",
  },
};

/**
 * Resolve the `notice` query value to a known message.
 *
 * Never throws and never echoes the caller's string: an unknown or malformed
 * value is silently ignored, so the query parameter cannot be used to inject
 * text into the page.
 */
export function resolveAccountNotice(value: unknown): AccountNotice | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return null;
  }
  return NOTICES[raw] ?? null;
}