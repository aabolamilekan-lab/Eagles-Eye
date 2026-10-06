import { z } from "zod";

/**
 * Login input.
 *
 * The identifier is normalized (trimmed, lowercased) before it reaches the
 * database, so `Admin@Example.com` and `admin@example.com` are one account and
 * one rate-limit bucket. Length ceilings reject oversized bodies before any
 * hashing work. Unknown keys are stripped by Zod's default object behavior.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
});

export type LoginInput = z.infer<typeof loginSchema>;
