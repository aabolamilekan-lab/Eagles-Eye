import { describe, expect, it } from "vitest";
import { evaluateThrottle } from "@/lib/rate-limit/throttle";

const config = { maxAttempts: 5, windowSeconds: 900 };
const now = 1_000 * 1000;
const windowMs = config.windowSeconds * 1000;

describe("evaluateThrottle", () => {
  it("allows an attempt with no history", () => {
    expect(
      evaluateThrottle({ now, ipAttempts: [], consecutiveFailures: [], config }),
    ).toEqual({ allowed: true });
  });

  it("allows attempts below the IP ceiling", () => {
    const result = evaluateThrottle({
      now,
      ipAttempts: [now - 1000, now - 2000],
      consecutiveFailures: [],
      config,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("blocks when the IP ceiling is reached and reports a retry delay", () => {
    const oldest = now - 60 * 1000;
    const result = evaluateThrottle({
      now,
      ipAttempts: [oldest, now - 4, now - 3, now - 2, now - 1],
      consecutiveFailures: [],
      config,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(config.windowSeconds);
    }
  });

  it("ignores IP attempts older than the window", () => {
    const result = evaluateThrottle({
      now,
      ipAttempts: [now - windowMs - 1, now - windowMs - 2, now - 1],
      consecutiveFailures: [],
      config,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("applies exponential delay after repeated identifier failures", () => {
    const lastFailure = now - 500;
    const failures = [lastFailure, lastFailure - 1, lastFailure - 2, lastFailure - 3, lastFailure - 4];
    const firstBlocked = evaluateThrottle({ now, ipAttempts: [], consecutiveFailures: failures, config });
    expect(firstBlocked.allowed).toBe(false);

    const sixFailures = [...failures, lastFailure - 5];
    const twoSecondBlock = evaluateThrottle({
      now,
      ipAttempts: [],
      consecutiveFailures: sixFailures,
      config,
    });
    expect(twoSecondBlock).toEqual({ allowed: false, retryAfterSeconds: 2 });
  });

  it("allows again once the delay has elapsed", () => {
    const lastFailure = now - 60 * 1000;
    const failures = Array.from({ length: 5 }, (_, index) => lastFailure - index);
    expect(evaluateThrottle({ now, ipAttempts: [], consecutiveFailures: failures, config })).toEqual({
      allowed: true,
    });
  });

  it("caps the delay at the window length", () => {
    const lastFailure = now;
    const failures = Array.from({ length: 30 }, (_, index) => lastFailure - index);
    const result = evaluateThrottle({
      now,
      ipAttempts: [],
      consecutiveFailures: failures,
      config,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(config.windowSeconds);
    }
  });
});
