import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv, isProduction } from "@/lib/env";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookie,
  evaluateSessionLifetime,
  hashSessionToken,
  mintSessionToken,
  sessionCookie,
} from "@/lib/auth/session-token";

/**
 * Session lifecycle against the database and the request cookie.
 *
 * The raw token lives only in the HttpOnly cookie and request memory. The
 * database stores a keyed HMAC-SHA256 hash, so a database leak yields no usable
 * session token. Claims live in the `Session` row, not in the token, so a role
 * change cannot be replayed around.
 *
 * AGENTS.md sections 7 and 8.
 */
export { SESSION_COOKIE_NAME } from "@/lib/auth/session-token";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export interface ActiveSession {
  id: string;
  userId: string;
  expiresAt: Date;
  user: SessionUser;
}

/** Mint a token and persist its hash as a new session for `userId`. */
export async function issueSession(userId: string): Promise<{ token: string }> {
  const env = getEnv();
  const token = mintSessionToken();
  const tokenHash = hashSessionToken(token, env.AUTH_SECRET);
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: { tokenHash, userId, expiresAt },
    select: { id: true },
  });

  return { token };
}

/** Read the cookie, resolve the session row, and apply lifetime rules. */
export async function readSession(): Promise<ActiveSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const env = getEnv();
  const tokenHash = hashSessionToken(token, env.AUTH_SECRET);

  const row = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: { id: true, email: true, name: true, role: true, isActive: true },
      },
    },
  });

  if (!row || row.revokedAt) {
    return null;
  }

  const lifetime = evaluateSessionLifetime({
    now: Date.now(),
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    windowSeconds: env.SESSION_MAX_AGE_SECONDS,
  });

  if (lifetime.status === "expired") {
    await revokeSession(row.id);
    return null;
  }

  if (!row.user.isActive) {
    await revokeAllSessionsForUser(row.userId);
    return null;
  }

  if (lifetime.renew) {
    await prisma.session.update({
      where: { id: row.id },
      data: { expiresAt: new Date(lifetime.nextExpiresAt) },
      select: { id: true },
    });
  }

  return {
    id: row.id,
    userId: row.userId,
    expiresAt: new Date(lifetime.nextExpiresAt),
    user: row.user,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const env = getEnv();
  const store = await cookies();
  store.set(sessionCookie(token, env.SESSION_MAX_AGE_SECONDS, isProduction()));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(clearedSessionCookie(isProduction()));
}

/** Revoke one session by id (logout, single device). */
export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every session for a user (password change, role change, deactivation). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke the session referenced by the current cookie, then clear the cookie.
 * Clearing the cookie alone is not logout.
 */
export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const env = getEnv();
    const tokenHash = hashSessionToken(token, env.AUTH_SECRET);
    await prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  store.delete(SESSION_COOKIE_NAME);
}
