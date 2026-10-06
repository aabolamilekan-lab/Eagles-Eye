/**
 * Shared sign-in contract.
 *
 * Kept out of the `"use server"` action module, which may only export async
 * functions, and out of the client component so both sides and the tests read
 * one definition. Every credential-level failure returns the same code and the
 * same message: the response must not reveal whether an account exists, is
 * inactive, or is locked (AGENTS.md section 7).
 */
export type LoginErrorCode = "invalid_credentials" | "rate_limited";

export interface LoginActionState {
  code?: LoginErrorCode;
  message?: string;
}

export const INVALID_CREDENTIALS_CODE = "invalid_credentials" as const;
export const RATE_LIMITED_CODE = "rate_limited" as const;

export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
export const RATE_LIMITED_MESSAGE = "Too many attempts. Try again later.";
