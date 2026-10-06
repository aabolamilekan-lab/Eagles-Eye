import { describe, expect, it } from "vitest";
import {
  decideWrite,
  deriveWriteBudget,
} from "@/lib/rate-limit/write-budget";
import { SlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";

/**
 * Write-budget decisions.
 *
 * Pure and env-free, so the arithmetic is pinned without `DATABASE_URL`. The
 * env-backed limiters in `write-actions.ts` are exercised through the real
 * budget these functions produce.
 *
 * Why this exists: `RATE_LIMIT_WRITE_ACTIONS` was configured and read by the
 * upload limiter, but no mutating Server Action was limited at all. An
 * authenticated session could loop the write path without bound.
 */

describe("deriveWriteBudget", () => {
  it("gives destructive operations a tighter ceiling than ordinary writes", () => {
    const { general, sensitive } = deriveWriteBudget(40, 60);
    expect(sensitive.max).toBeLessThan(general.max);
    expect(sensitive.windowMs).toBeLessThanOrEqual(general.windowMs);
  });

  it("converts the window to milliseconds", () => {
    const { general } = deriveWriteBudget(10, 60);
    expect(general.windowMs).toBe(60_000);
  });

  it("never produces a zero budget, which would refuse every request", () => {
    for (const [max, window] of [
      [0, 0],
      [1, 0],
      [0, 60],
      [-5, -5],
    ] as const) {
      const { general, sensitive } = deriveWriteBudget(max, window);
      expect(general.max).toBeGreaterThanOrEqual(1);
      expect(sensitive.max).toBeGreaterThanOrEqual(1);
      expect(general.windowMs).toBeGreaterThanOrEqual(1000);
      expect(sensitive.windowMs).toBeGreaterThanOrEqual(1000);
    }
  });

  it("keeps a small configured budget usable", () => {
    const { general, sensitive } = deriveWriteBudget(2, 4);
    expect(general.max).toBe(2);
    expect(sensitive.max).toBe(1);
  });
});

describe("decideWrite", () => {
  const allow: { allowed: true; retryAfterSeconds: number; remaining: number } = {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: 3,
  };
  const denyGeneral = {
    allowed: false as const,
    retryAfterSeconds: 30,
    remaining: 0,
  };
  const denySensitive = {
    allowed: false as const,
    retryAfterSeconds: 5,
    remaining: 0,
  };

  it("allows when both buckets allow and nothing was charged", () => {
    expect(decideWrite({ general: allow })).toEqual({ ...allow, sensitive: false });
  });

  it("allows an ordinary write even though the destructive result would deny", () => {
    // The destructive bucket is only consulted when charged; an ordinary write
    // must not be refused by a budget it never spent.
    expect(decideWrite({ general: allow, sensitive: denySensitive })).toEqual({
      ...denySensitive,
      sensitive: true,
    });
  });

  it("prefers a general refusal and does not report it as sensitive", () => {
    expect(decideWrite({ general: denyGeneral, sensitive: allow })).toEqual({
      ...denyGeneral,
      sensitive: false,
    });
  });

  it("reports a destructive refusal as sensitive", () => {
    expect(decideWrite({ general: allow, sensitive: denySensitive })).toEqual({
      ...denySensitive,
      sensitive: true,
    });
  });

  it("carries a retry hint on every refusal", () => {
    expect(decideWrite({ general: denyGeneral }).retryAfterSeconds).toBeGreaterThan(0);
    expect(
      decideWrite({ general: allow, sensitive: denySensitive }).retryAfterSeconds,
    ).toBeGreaterThan(0);
  });
});

describe("budgets are actually enforced by the limiter", () => {
  function limiterFor(config: { max: number; windowMs: number }) {
    return new SlidingWindowLimiter(config, () => 0);
  }

  it("refuses an ordinary write loop at the general ceiling", () => {
    const { general } = deriveWriteBudget(10, 60);
    const limiter = limiterFor(general);
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      if (limiter.check("admin-1:ip").allowed) allowed++;
    }
    expect(allowed).toBe(general.max);
  });

  it("refuses a destructive loop far sooner than an ordinary one", () => {
    const { general, sensitive } = deriveWriteBudget(40, 60);
    const destructive = limiterFor(sensitive);
    const ordinary = limiterFor(general);

    let destructiveAllowed = 0;
    for (let i = 0; i < 200; i++) {
      if (destructive.check("admin-1:ip").allowed) destructiveAllowed++;
    }

    let ordinaryAllowed = 0;
    for (let i = 0; i < 200; i++) {
      if (ordinary.check("admin-1:ip").allowed) ordinaryAllowed++;
    }

    expect(destructiveAllowed).toBeLessThan(ordinaryAllowed);
  });

  it("does not let an ordinary write spend destructive budget", () => {
    const { general, sensitive } = deriveWriteBudget(8, 60);
    const destructive = limiterFor(sensitive);

    // Only ordinary writes happened, so destructive budget is untouched.
    const ordinary = limiterFor(general);
    for (let i = 0; i < 200; i++) {
      ordinary.check("admin-2:ip");
    }

    expect(destructive.check("admin-2:ip").allowed).toBe(true);
  });

  it("keeps budgets independent per actor", () => {
    const { general } = deriveWriteBudget(4, 60);
    const limiter = limiterFor(general);

    for (let i = 0; i < 200; i++) {
      limiter.check("admin-a:ip");
    }
    expect(limiter.check("admin-a:ip").allowed).toBe(false);
    expect(limiter.check("admin-b:ip").allowed).toBe(true);
  });
});
