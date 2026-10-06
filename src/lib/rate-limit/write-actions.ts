import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  clientIpFromHeaders,
  SlidingWindowLimiter,
} from "@/lib/rate-limit/sliding-window";
import {
  decideWrite,
  deriveWriteBudget,
  type RateLimitDecision,
  type WriteBudgetConfig,
} from "@/lib/rate-limit/write-budget";

/**
 * Mutating Server Action throttling.
 *
 * `requireCapability` authenticates and authorizes the caller, so this limiter
 * only ever sees an actor who already holds a valid session. Its job is
 * different: an authenticated admin who is hijacked, buggy, or hostile must not
 * be able to turn the write path into an unbounded loop of creates, deletes or
 * status transitions.
 *
 * Keying is `userId:ip` rather than IP alone, so one admin cannot exhaust
 * another admin's budget and a shared NAT does not throttle the whole office.
 * User id is part of the key precisely because it is server-derived from the
 * session row and cannot be spoofed by the caller.
 *
 * Destructive and high-frequency operations take a second, much tighter bucket
 * of their own, so a bulk delete or a reorder cannot ride the general write
 * budget.
 *
 * The decision itself is pure and lives in `write-budget.ts`; this module only
 * binds it to environment configuration and the shared in-memory limiter.
 *
 * AGENTS.md sections 7, 15 and 24.
 */

let writeLimiter: SlidingWindowLimiter | null = null;
let sensitiveLimiter: SlidingWindowLimiter | null = null;

function budget(): WriteBudgetConfig {
  const env = getEnv();
  return deriveWriteBudget(
    env.RATE_LIMIT_WRITE_ACTIONS,
    env.RATE_LIMIT_WRITE_WINDOW_SECONDS,
  );
}

/** Budget for ordinary mutating actions. */
export function getWriteLimiter(): SlidingWindowLimiter {
  if (!writeLimiter) {
    writeLimiter = new SlidingWindowLimiter(budget().general);
  }
  return writeLimiter;
}

/**
 * Budget for destructive and high-frequency actions: deletes, reorders, and
 * cover removal. A quarter of the general write budget over a quarter of the
 * window.
 */
export function getSensitiveWriteLimiter(): SlidingWindowLimiter {
  if (!sensitiveLimiter) {
    sensitiveLimiter = new SlidingWindowLimiter(budget().sensitive);
  }
  return sensitiveLimiter;
}

/** The subset of `Headers` this module reads, so it is easy to stub in tests. */
export interface HeaderReader {
  get(name: string): string | null;
}

export interface WriteLimitSubject {
  /** Server-derived from the session row. Never from a form field. */
  userId: string;
  headers: HeaderReader;
}

/**
 * Charge the actor's write budget.
 *
 * The general bucket is charged on every call. The destructive bucket is charged
 * only when `sensitive` is set, so a normal create never consumes destruction
 * budget.
 */
export function checkWriteLimit(
  subject: WriteLimitSubject,
  sensitive = false,
): RateLimitDecision & { sensitive: boolean } {
  const key = `${subject.userId}:${clientIpFromHeaders(subject.headers)}`;

  const general = getWriteLimiter().check(key);

  return decideWrite({
    general,
    sensitive: sensitive ? getSensitiveWriteLimiter().check(key) : undefined,
  });
}

/**
 * Charge the budget and log a refusal.
 *
 * Returns the decision so a caller that can render a message can use it; the
 * Server Action path redirects instead, in `enforceWriteLimit`.
 */
export function enforceWriteLimit(
  subject: WriteLimitSubject,
  sensitive: boolean,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const decision = checkWriteLimit(subject, sensitive);

  if (!decision.allowed) {
    logger.warn("write.rate_limited", {
      userId: subject.userId,
      bucket: decision.sensitive ? "sensitive" : "general",
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return { allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
  }

  return { allowed: true };
}

/** Test-only: drop the memoized limiters. */
export function resetWriteLimitersForTests(): void {
  writeLimiter = null;
  sensitiveLimiter = null;
}
