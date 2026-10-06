/**
 * Login throttle decision.
 *
 * Pure and time-parameterized so it can be tested without a clock or a
 * database. The database-backed readers live in `login.ts`.
 *
 * Two independent buckets are evaluated: per IP (all attempts in the window)
 * and per identifier (consecutive failures since the last success). The
 * stricter outcome wins.
 */
export interface ThrottleConfig {
  maxAttempts: number;
  windowSeconds: number;
}

export interface ThrottleInput {
  now: number;
  /** Timestamps (ms) of every attempt from this IP within the window. */
  ipAttempts: readonly number[];
  /** Timestamps (ms) of consecutive failures for this identifier, oldest first. */
  consecutiveFailures: readonly number[];
  config: ThrottleConfig;
}

export type ThrottleResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function evaluateThrottle(input: ThrottleInput): ThrottleResult {
  const { now, ipAttempts, consecutiveFailures, config } = input;
  const windowMs = config.windowSeconds * 1000;
  const threshold = now - windowMs;

  const ipInWindow = ipAttempts.filter((at) => at > threshold);
  if (ipInWindow.length >= config.maxAttempts) {
    const oldest = Math.min(...ipInWindow);
    const readyAt = oldest + windowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((readyAt - now) / 1000)),
    };
  }

  if (consecutiveFailures.length >= config.maxAttempts) {
    const exponent = consecutiveFailures.length - config.maxAttempts;
    const delaySeconds = Math.min(2 ** exponent, config.windowSeconds);
    const lastFailure = Math.max(...consecutiveFailures);
    const readyAt = lastFailure + delaySeconds * 1000;
    if (now < readyAt) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((readyAt - now) / 1000),
      };
    }
  }

  return { allowed: true };
}
