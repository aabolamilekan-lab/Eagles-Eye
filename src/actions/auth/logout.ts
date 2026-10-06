"use server";

import { redirect } from "next/navigation";
import { revokeCurrentSession } from "@/lib/auth/session";

/**
 * Sign-out Server Action.
 *
 * Revokes the session row server-side, then clears the cookie. Clearing the
 * cookie alone would leave the token valid if it were replayed.
 */
export async function logoutAction(): Promise<void> {
  await revokeCurrentSession();
  redirect("/admin/login");
}
