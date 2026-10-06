import { z } from "zod";

/**
 * Zod schemas for Administrator account management.
 *
 * The account screen edits the signed-in administrator's own display name and
 * password. Email, role, and status are never accepted from the form: they are
 * read from the session's database row and echoed back read-only, so a crafted
 * request cannot escalate a role or rename an identity (AGENTS.md section 8).
 *
 * Every schema is `.strict()`, so an unknown key is a parse error rather than
 * data that reaches Prisma. Input types are always `z.infer`, never a
 * hand-written duplicate.
 */

export const ACCOUNT_NAME_MAX = 120;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 1024;

const nameField = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(ACCOUNT_NAME_MAX, `Keep the name under ${ACCOUNT_NAME_MAX} characters.`);

const passwordField = z.string().min(1).max(PASSWORD_MAX);

export const updateProfileSchema = z
  .object({
    name: nameField,
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: passwordField,
    newPassword: z
      .string()
      .min(
        PASSWORD_MIN,
        `Use at least ${PASSWORD_MIN} characters.`,
      )
      .max(PASSWORD_MAX),
    confirmPassword: passwordField,
  })
  .strict()
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;