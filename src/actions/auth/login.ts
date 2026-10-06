"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { issueSession, setSessionCookie } from "@/lib/auth/session";
import {
  INVALID_CREDENTIALS_CODE,
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_CODE,
  RATE_LIMITED_MESSAGE,
  type LoginActionState,
} from "@/lib/auth/login-messages";
import {
  evaluateThrottle,
  getClientIp,
  getConsecutiveFailures,
  getRecentIpAttempts,
  recordLoginAttempt,
} from "@/lib/rate-limit/login";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Sign-in Server Action.
 *
 * Order is fixed: validate, throttle, verify (with a dummy hash for unknown
 * accounts), then mint. Every credential-level failure returns one identical
 * message, so the response cannot enumerate accounts. The role is loaded from
 * the database, never from the form.
 *
 * A `"use server"` module may only export async functions, so the result type
 * and messages live in `@/lib/auth/login-messages`.
 */
export async function loginAction(
  _previous: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      code: INVALID_CREDENTIALS_CODE,
      message: INVALID_CREDENTIALS_MESSAGE,
    };
  }

  const { email, password } = parsed.data;
  const env = getEnv();
  const ip = await getClientIp();
  const now = Date.now();

  const windowStart = new Date(now - env.RATE_LIMIT_LOGIN_WINDOW_SECONDS * 1000);
  const [ipAttempts, consecutiveFailures] = await Promise.all([
    getRecentIpAttempts(ip, windowStart),
    getConsecutiveFailures(email),
  ]);

  const throttle = evaluateThrottle({
    now,
    ipAttempts,
    consecutiveFailures,
    config: {
      maxAttempts: env.RATE_LIMIT_LOGIN_ATTEMPTS,
      windowSeconds: env.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    },
  });

  if (!throttle.allowed) {
    await recordLoginAttempt({ identifier: email, ip, succeeded: false });
    logger.warn("auth.login.rate_limited", { ip });
    return { code: RATE_LIMITED_CODE, message: RATE_LIMITED_MESSAGE };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, passwordHash: true, isActive: true },
  });

  let valid = false;
  let needsRehash = false;

  if (user) {
    const result = await verifyPassword(user.passwordHash, password);
    valid = result.valid;
    needsRehash = result.needsRehash;
  } else {
    // Match the timing of a real verify so an unknown account is not detectable.
    await verifyAgainstDummy(password);
  }

  if (!user || !valid || !user.isActive) {
    await recordLoginAttempt({ identifier: email, ip, succeeded: false });
    logger.warn("auth.login.failed", { ip });
    return {
      code: INVALID_CREDENTIALS_CODE,
      message: INVALID_CREDENTIALS_MESSAGE,
    };
  }

  if (needsRehash) {
    const upgraded = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: upgraded },
      select: { id: true },
    });
  }

  await recordLoginAttempt({ identifier: email, ip, succeeded: true });
  const { token } = await issueSession(user.id);
  await setSessionCookie(token);
  logger.info("auth.login.success", { userId: user.id });

  redirect("/admin");
}
