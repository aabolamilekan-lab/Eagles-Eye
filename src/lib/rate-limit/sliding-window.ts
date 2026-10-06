/**
 * Pure sliding-window rate limiter.
 *
 * This is an in-memory guard, adequate for a single-instance deployment and as
 * a defense-in-depth second layer. A multi-instance deployment should back the
 * same interface with shared storage. The clock is injected so behaviour is
 * deterministic under test. Kept free of `next/*` imports so it stays unit
 * testable and reusable by every limiter in this folder.
 *
 * AGENTS.md sections 7 and 24.
 */

export interface SlidingWindowConfig {
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

const SWEEP_THRESHOLD = 10_000;

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly config: SlidingWindowConfig,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitDecision {
    const at = this.now();
    const threshold = at - this.config.windowMs;

    const recent = (this.hits.get(key) ?? []).filter((time) => time > threshold);

    if (recent.length >= this.config.max) {
      const oldest = Math.min(...recent);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.config.windowMs - at) / 1000),
      );
      this.hits.set(key, recent);
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    }

    recent.push(at);
    this.hits.set(key, recent);

    if (this.hits.size > SWEEP_THRESHOLD) {
      this.sweep(threshold);
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: this.config.max - recent.length,
    };
  }

  reset(): void {
    this.hits.clear();
  }

  private sweep(threshold: number): void {
    for (const [key, times] of this.hits) {
      const lived = times.filter((time) => time > threshold);
      if (lived.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, lived);
      }
    }
  }
}

/** The subset of `Headers` this helper reads, so it is easy to stub. */
export interface HeaderReader {
  get(name: string): string | null;
}

/** Best-effort client IP from request headers, capped in length. */
export function clientIpFromHeaders(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) {
    return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : "unknown";
}
