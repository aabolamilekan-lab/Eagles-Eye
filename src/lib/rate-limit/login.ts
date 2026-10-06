import { headers } from "next/headers";
import { prisma } from "@/lib/db";

/**
 * Login throttling against the database.
 *
 * The pure decision lives in `throttle.ts`; this module reads and writes the
 * `LoginAttempt` rows that back it. The table is the source of truth, so a
 * process restart or a second instance behaves identically — there are no
 * in-memory counters.
 *
 * AGENTS.md section 7.
 */
export { evaluateThrottle } from "@/lib/rate-limit/throttle";
export type {
  ThrottleConfig,
  ThrottleInput,
  ThrottleResult,
} from "@/lib/rate-limit/throttle";

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is trusted only as far as the deployment's proxy sets it;
 * it is spoofable when the app is exposed directly. It is used for one of two
 * independent limits — the identifier limit holds regardless — and is capped in
 * length so it cannot be used to store oversized rows.
 */
export async function getClientIp(): Promise<string> {
  const store = await headers();

  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first.slice(0, 64);
    }
  }

  const real = store.get("x-real-ip");
  if (real) {
    return real.trim().slice(0, 64);
  }

  return "unknown";
}

/** Attempt timestamps for an IP since `windowStart`. */
export async function getRecentIpAttempts(
  ip: string,
  windowStart: Date,
): Promise<number[]> {
  const rows = await prisma.loginAttempt.findMany({
    where: { ip, attemptedAt: { gte: windowStart } },
    select: { attemptedAt: true },
    orderBy: { attemptedAt: "desc" },
    take: 200,
  });

  return rows.map((row) => row.attemptedAt.getTime());
}

/**
 * Failure timestamps for an identifier since its last success, oldest first.
 * Walking newest-to-oldest and stopping at the first success yields exactly the
 * consecutive-failure window.
 */
export async function getConsecutiveFailures(identifier: string): Promise<number[]> {
  const rows = await prisma.loginAttempt.findMany({
    where: { identifier },
    select: { succeeded: true, attemptedAt: true },
    orderBy: { attemptedAt: "desc" },
    take: 100,
  });

  const failures: number[] = [];
  for (const row of rows) {
    if (row.succeeded) {
      break;
    }
    failures.push(row.attemptedAt.getTime());
  }

  return failures.reverse();
}

export async function recordLoginAttempt(input: {
  identifier: string;
  ip: string;
  succeeded: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      identifier: input.identifier,
      ip: input.ip,
      succeeded: input.succeeded,
    },
    select: { id: true },
  });
}
