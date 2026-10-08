import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import {
  getSearchLimiter,
  resetSearchLimiterForTests,
} from "@/lib/rate-limit/search";

/**
 * Public search throttle wiring.
 *
 * The sliding-window arithmetic itself is covered by
 * `rate-limit-upload.test.ts` (the same class); what is under test here is the
 * search-specific binding: the limiter reads `RATE_LIMIT_SEARCH_*` from the
 * environment, is keyed per client IP, and is memoized so a burst shares one
 * window. AGENTS.md sections 7 and 24, search skill security requirements.
 */

const ENV_KEYS = [
  "RATE_LIMIT_SEARCH_REQUESTS",
  "RATE_LIMIT_SEARCH_WINDOW_SECONDS",
  // `getEnv` enforces the full contract before it returns the search limits.
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;
const original: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  original[key] = process.env[key];
}

function configureSearchLimit(max: number, windowSeconds: number): void {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";
  process.env.AUTH_SECRET ??= "x".repeat(32);
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
  process.env.RATE_LIMIT_SEARCH_REQUESTS = String(max);
  process.env.RATE_LIMIT_SEARCH_WINDOW_SECONDS = String(windowSeconds);
  resetEnvCacheForTests();
  resetSearchLimiterForTests();
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnvCacheForTests();
  resetSearchLimiterForTests();
});

describe("search rate limiter", () => {
  it("allows up to the configured maximum then rejects the same IP", () => {
    configureSearchLimit(3, 60);
    const limiter = getSearchLimiter();

    expect(limiter.check("203.0.113.7").allowed).toBe(true);
    expect(limiter.check("203.0.113.7").allowed).toBe(true);
    expect(limiter.check("203.0.113.7").allowed).toBe(true);

    const blocked = limiter.check("203.0.113.7");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps one IP's burst from blocking another IP", () => {
    configureSearchLimit(1, 60);
    const limiter = getSearchLimiter();

    expect(limiter.check("203.0.113.7").allowed).toBe(true);
    expect(limiter.check("203.0.113.7").allowed).toBe(false);
    expect(limiter.check("198.51.100.20").allowed).toBe(true);
  });

  it("is memoized so a burst shares one window, and reset clears it", () => {
    configureSearchLimit(1, 60);

    expect(getSearchLimiter()).toBe(getSearchLimiter());

    const limiter = getSearchLimiter();
    expect(limiter.check("203.0.113.7").allowed).toBe(true);
    expect(limiter.check("203.0.113.7").allowed).toBe(false);

    resetSearchLimiterForTests();
    expect(getSearchLimiter()).not.toBe(limiter);
    expect(getSearchLimiter().check("203.0.113.7").allowed).toBe(true);
  });

  it("honours the configured window rather than a hard-coded one", () => {
    configureSearchLimit(1, 60);
    const limiter = getSearchLimiter();

    expect(limiter.check("203.0.113.7").allowed).toBe(true);
    const blocked = limiter.check("203.0.113.7");
    expect(blocked.allowed).toBe(false);
    // A 60s window means the retry hint is at most a minute away.
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
