/**
 * Pure write-budget decisions.
 *
 * Split from the env-backed limiters in `write-actions.ts` so the decision logic
 * is testable without `DATABASE_URL` and friends, matching the split already
 * used by the login throttle (`throttle.ts` + `login.ts`).
 *
 * AGENTS.md sections 7 and 24.
 */

export interface SlidingWindowConfig {
  max: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export interface WriteBudgetConfig {
  /** Ceiling for ordinary mutating actions. */
  general: SlidingWindowConfig;
  /** Ceiling for destructive and high-frequency actions. Must be tighter. */
  sensitive: SlidingWindowConfig;
}

/**
 * Derive the destructive budget from the general one.
 *
 * A quarter of the attempts over a quarter of the window is a proportionally
 * tighter ceiling on exactly the operations that cannot be undone from the UI.
 * Both values are floored at 1 so a misconfigured environment cannot produce a
 * budget of zero, which would refuse every destructive action.
 */
export function deriveWriteBudget(
  max: number,
  windowSeconds: number,
): WriteBudgetConfig {
  const general: SlidingWindowConfig = {
    max: Math.max(1, max),
    windowMs: Math.max(1, windowSeconds) * 1000,
  };

  const sensitive: SlidingWindowConfig = {
    max: Math.max(1, Math.ceil(general.max / 4)),
    windowMs: Math.max(1, Math.ceil(general.windowMs / 4000)) * 1000,
  };

  return { general, sensitive };
}

export interface WriteDecisionInput {
  general: RateLimitDecision;
  /** Result of charging the destructive bucket, when it was charged. */
  sensitive?: RateLimitDecision;
}

export interface WriteDecision extends RateLimitDecision {
  /** True when the destructive bucket, not the general one, refused. */
  sensitive: boolean;
}

/**
 * Combine two bucket results, preferring a refusal over a grant.
 *
 * The general bucket is charged first by the caller. When it refuses, the
 * destructive bucket is not consulted, so a request cannot spend destruction
 * budget it was already denied.
 */
export function decideWrite(input: WriteDecisionInput): WriteDecision {
  if (!input.general.allowed) {
    return { ...input.general, sensitive: false };
  }

  if (input.sensitive) {
    return { ...input.sensitive, sensitive: true };
  }

  return { ...input.general, sensitive: false };
}
