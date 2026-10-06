import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure session primitives.
 *
 * Token minting, hashing, cookie shape, and lifetime maths. This module has no
 * database or request dependency so the security-relevant logic is unit
 * testable and cannot accidentally acquire ambient state.
 */
export const SESSION_COOKIE_NAME = "ee_session";

export interface SessionCookie {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
  expires: Date;
  priority?: "high";
}

/** 32 bytes of CSPRNG entropy, base64url encoded (256 bits). */
export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic, key-dependent hash. Never equal to the raw token. */
export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/** Constant-time comparison for two strings of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Build the session cookie.
 *
 * `secure` is forced by the caller from `NODE_ENV`, never from a configurable
 * variable. `httpOnly` and `sameSite: "lax"` are unconditional.
 */
export function sessionCookie(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
  now: number = Date.now(),
): SessionCookie {
  const cookie: SessionCookie = {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
    expires: new Date(now + maxAgeSeconds * 1000),
  };

  if (secure) {
    cookie.priority = "high";
  }

  return cookie;
}

/** An expired cookie that clears the session from the browser. */
export function clearedSessionCookie(secure: boolean): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export interface SessionLifetime {
  status: "valid" | "expired";
  /** Expiry to persist/carry after this evaluation. */
  nextExpiresAt: number;
  /** True when the remaining lifetime is under half the sliding window. */
  renew: boolean;
}

/**
 * Sliding window with an absolute ceiling.
 *
 * `nextExpiresAt = min(now + window, createdAt + 2 * window)`. When that is not
 * after `now` the session is dead, and renewal can never resurrect it. Renewal
 * only happens once the remaining lifetime falls under half the window, so
 * `expiresAt` is not a hot write on every request.
 */
export function evaluateSessionLifetime(args: {
  now: number;
  createdAt: number;
  expiresAt: number;
  windowSeconds: number;
}): SessionLifetime {
  const windowMs = args.windowSeconds * 1000;
  const ceiling = args.createdAt + 2 * windowMs;
  const nextExpiresAt = Math.min(args.now + windowMs, ceiling);

  if (args.now >= args.expiresAt || nextExpiresAt <= args.now) {
    return { status: "expired", nextExpiresAt: args.expiresAt, renew: false };
  }

  const renew = args.expiresAt - args.now < windowMs / 2;
  return { status: "valid", nextExpiresAt, renew };
}
