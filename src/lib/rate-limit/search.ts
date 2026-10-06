import { getEnv } from "@/lib/env";
import { SlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

/**
 * Public search throttling, keyed by client IP.
 *
 * Search is a read, but an unauthenticated one that hits `ILIKE` across several
 * columns. A generous per-IP ceiling keeps the catalogue usable while stopping
 * a scanner from turning it into a load test. In-memory and single-instance,
 * like the upload limiter; the interface is shared so it can be backed by
 * storage later.
 *
 * AGENTS.md sections 7 and 24.
 */

let limiter: SlidingWindowLimiter | null = null;

export function getSearchLimiter(): SlidingWindowLimiter {
  if (!limiter) {
    const env = getEnv();
    limiter = new SlidingWindowLimiter({
      max: env.RATE_LIMIT_SEARCH_REQUESTS,
      windowMs: env.RATE_LIMIT_SEARCH_WINDOW_SECONDS * 1000,
    });
  }
  return limiter;
}

/** Test-only: drop the memoized limiter. */
export function resetSearchLimiterForTests(): void {
  limiter = null;
}
