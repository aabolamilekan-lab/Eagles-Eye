import { describe, expect, it } from "vitest";
import {
  clientIpFromRequest,
  SlidingWindowLimiter,
} from "@/lib/rate-limit/upload";

/**
 * Upload throttle.
 *
 * A pure sliding window with an injected clock, so the boundary behaviour is
 * deterministic. The in-memory store is a single-instance guard; the class is
 * the unit under test.
 */
function clock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the maximum then rejects", () => {
    const time = clock();
    const limiter = new SlidingWindowLimiter(
      { max: 2, windowMs: 1000 },
      time.now,
    );

    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);

    const blocked = limiter.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("recovers once the window slides past the oldest hit", () => {
    const time = clock();
    const limiter = new SlidingWindowLimiter(
      { max: 1, windowMs: 1000 },
      time.now,
    );

    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);

    time.advance(1001);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("isolates keys", () => {
    const limiter = new SlidingWindowLimiter(
      { max: 1, windowMs: 1000 },
      () => 5,
    );

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("reports remaining capacity", () => {
    const limiter = new SlidingWindowLimiter(
      { max: 3, windowMs: 1000 },
      () => 0,
    );
    expect(limiter.check("k").remaining).toBe(2);
    expect(limiter.check("k").remaining).toBe(1);
    expect(limiter.check("k").remaining).toBe(0);
  });

  it("clears on reset", () => {
    const limiter = new SlidingWindowLimiter(
      { max: 1, windowMs: 1000 },
      () => 0,
    );
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
    limiter.reset();
    expect(limiter.check("k").allowed).toBe(true);
  });
});

describe("clientIpFromRequest", () => {
  it("uses the first hop of x-forwarded-for", () => {
    const request = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientIpFromRequest(request)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("http://localhost/api", {
      headers: { "x-real-ip": "198.51.100.9" },
    });
    expect(clientIpFromRequest(request)).toBe("198.51.100.9");
  });

  it("returns a safe default when no header is present", () => {
    const request = new Request("http://localhost/api");
    expect(clientIpFromRequest(request)).toBe("unknown");
  });
});
