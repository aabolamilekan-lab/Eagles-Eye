"use server";

import { redirect } from "next/navigation";
import type { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireWriteCapability } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  issueSession,
  revokeAllSessionsForUser,
  setSessionCookie,
} from "@/lib/auth/session";
import type { AccountFormState } from "@/lib/account/form";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "@/lib/validation/user";

/**
 * Account settings mutations.
 *
 * Both actions authorize at call time through `requireWriteCapability`, so the
 * page gate is never the only check (AGENTS.md section 15). The actor is always
 * `session.userId`; no id is read from the form, so one admin cannot edit
 * another's account (IDOR, AGENTS.md section 8).
 *
 * A password change is charged the tighter "sensitive" write budget, revokes
 * every session for the user, then mints a fresh session for this request so the
 * actor stays signed in while every other device is signed out.
 */
export async function updateProfileAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireWriteCapability("settings.manage");

  const parsed = updateProfileSchema.safeParse({
    name: readField(formData, "name"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }

  try {
    await prisma.user.update({
      where: { id: session.userId },
      data: { name: parsed.data.name },
      select: { id: true },
    });
  } catch (error) {
    logger.error("account.profile.update.failed", {
      userId: session.userId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return {
      status: "error",
      message: "Could not save your profile. Please try again.",
    };
  }

  logger.info("account.profile.updated", { userId: session.userId });
  redirect("/admin/settings?notice=profile_saved");
}

export async function changePasswordAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  // Changing a credential is security-sensitive: take the tighter budget.
  const session = await requireWriteCapability("settings.manage", "sensitive");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: readField(formData, "currentPassword"),
    newPassword: readField(formData, "newPassword"),
    confirmPassword: readField(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return invalidForm(parsed.error);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    return {
      status: "error",
      message: "Your account could not be found. Please sign in again.",
    };
  }

  const verified = await verifyPassword(
    user.passwordHash,
    parsed.data.currentPassword,
  );
  if (!verified.valid) {
    return {
      status: "error",
      fieldErrors: {
        currentPassword: ["That is not your current password."],
      },
    };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      select: { id: true },
    });
  } catch {
    logger.error("account.password.update.failed", { userId: user.id });
    return {
      status: "error",
      message: "Could not change your password. Please try again.",
    };
  }

  // Revoke every session, then mint a fresh one for this request, so the actor
  // stays signed in on this device while every other session is invalidated
  // immediately (AGENTS.md section 7).
  await revokeAllSessionsForUser(user.id);
  const { token } = await issueSession(user.id);
  await setSessionCookie(token);

  logger.info("account.password.changed", { userId: user.id });

  redirect("/admin/settings?notice=password_changed");
}

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function invalidForm(error: ZodError): AccountFormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(
    error.flatten().fieldErrors,
  )) {
    if (messages && messages.length > 0) {
      fieldErrors[key] = messages;
    }
  }

  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors,
  };
}