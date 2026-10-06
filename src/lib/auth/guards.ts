import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { readSession } from "@/lib/auth/session";
import { hasCapability, type Capability } from "@/lib/auth/permissions";
import { enforceWriteLimit } from "@/lib/rate-limit/write-actions";

/**
 * Authentication and authorization gates.
 *
 * `getSession` resolves the actor from the session cookie and its database row.
 * `requireAdmin` is the page-level gate; every Server Action and Route Handler
 * re-checks at call time, because a layout guard is a UX convenience, not
 * access control (AGENTS.md sections 8 and 15).
 *
 * Default deny: a missing session and a role without the capability both
 * reject.
 *
 * Read and write gating are deliberately separate. `requireCapability` is
 * authorization only: admin pages call it to decide what to render, and must
 * never spend write budget just because a page was viewed. `requireWriteCapability`
 * is the mutating chokepoint: it authorizes and then charges the actor's write
 * budget, so the limit cannot be forgotten at a new call site the way a
 * per-action check can. It cannot be bypassed by a crafted request either,
 * because the key is derived from the session row and the request IP, never
 * from anything the caller supplies.
 */
export interface AdminSession {
  userId: string;
  role: UserRole;
  email: string;
  name: string;
}

/** Resolve the current actor, or `null`. Never throws for an absent session. */
export async function getSession(): Promise<AdminSession | null> {
  const session = await readSession();
  if (!session || !session.user.isActive) {
    return null;
  }

  return {
    userId: session.user.id,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
  };
}

/** Require an authenticated admin, or redirect to sign-in. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();

  if (!session) {
    redirect("/admin/login");
  }

  if (!hasCapability(session.role, "admin.access")) {
    redirect("/");
  }

  return session;
}

/** Operations that cannot be undone from the UI take the tighter bucket. */
export type WriteSensitivity = "normal" | "sensitive";

/**
 * Require a specific capability, or reject. Authorization only: this spends no
 * write budget, so it is safe on page renders and nested layout guards.
 */
export async function requireCapability(
  capability: Capability,
): Promise<AdminSession> {
  const session = await requireAdmin();

  if (!hasCapability(session.role, capability)) {
    redirect("/admin");
  }

  return session;
}

/**
 * Require a capability and spend write budget on it. Every mutating Server
 * Action and Route Handler must go through this, never `requireCapability`.
 *
 * When `sensitivity` is `sensitive` — a delete, a reorder, a cover removal —
 * the actor is also charged the smaller destructive budget, so those operations
 * cannot consume the whole general allowance.
 */
export async function requireWriteCapability(
  capability: Capability,
  sensitivity: WriteSensitivity = "normal",
): Promise<AdminSession> {
  const session = await requireCapability(capability);

  await chargeWriteBudget(session, sensitivity);

  return session;
}

/**
 * Charge the actor's write budget, and refuse the request when it is spent.
 *
 * Split out of `requireCapability` so it can also be applied on its own where a
 * route performs a write without a capability check. The session is passed in
 * rather than re-read, so the caller cannot be tricked into charging a
 * different actor's budget than the one it authorized.
 */
export async function chargeWriteBudget(
  session: AdminSession,
  sensitivity: WriteSensitivity = "normal",
): Promise<void> {
  const limit = enforceWriteLimit(
    { userId: session.userId, headers: await headers() },
    sensitivity === "sensitive",
  );

  if (!limit.allowed) {
    redirect("/admin?error=rate_limited");
  }
}
