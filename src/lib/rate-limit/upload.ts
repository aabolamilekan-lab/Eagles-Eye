import { getEnv } from "@/lib/env";
import {
  clientIpFromHeaders,
  SlidingWindowLimiter,
} from "@/lib/rate-limit/sliding-window";

/**
 * Upload throttling: a sliding window per `userId:ip`.
 *
 * The pure limiter lives in `sliding-window.ts` and is re-exported here so the
 * upload limiter's public surface is unchanged. This is an in-memory guard,
 * adequate for a single-instance deployment and a defense-in-depth second
 * layer behind authentication.
 *
 * AGENTS.md sections 7 and 24.
 */
export {
  SlidingWindowLimiter,
  type RateLimitDecision,
  type SlidingWindowConfig,
} from "@/lib/rate-limit/sliding-window";

/** Best-effort client IP from an incoming `Request`, capped in length. */
export function clientIpFromRequest(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

let limiter: SlidingWindowLimiter | null = null;

export function getUploadLimiter(): SlidingWindowLimiter {
  if (!limiter) {
    const env = getEnv();
    limiter = new SlidingWindowLimiter({
      max: env.RATE_LIMIT_WRITE_ACTIONS,
      windowMs: env.RATE_LIMIT_WRITE_WINDOW_SECONDS * 1000,
    });
  }
  return limiter;
}

/** Test-only: drop the memoized limiter. */
export function resetUploadLimiterForTests(): void {
  limiter = null;
}
