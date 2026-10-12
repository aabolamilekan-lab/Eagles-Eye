import "server-only";
import crypto from "node:crypto";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Distributed Synchronization Lock Adapter for PostgreSQL / Prisma.
 *
 * Implements atomic lock semantics over the NewsSyncLock table:
 * 1. Single-statement atomic acquisition with conditional lease expiration check.
 * 2. Automatic reclamation of expired leases (lockedUntil < now).
 * 3. Strict ownership-checked release: a worker can ONLY release its own active lease.
 * 4. Strict ownership-checked renewal: prevents stale workers from extending expired leases.
 * 5. Safe RAII-style `withSyncLock` runner with guaranteed cleanup in finally blocks.
 */

export const DEFAULT_LOCK_ID = "global_news_sync";
export const DEFAULT_LEASE_DURATION_MS = 60_000; // 60 seconds

export interface LockAcquisitionResult {
  acquired: boolean;
  lockId: string;
  workerId: string;
  leaseExpiresAt?: Date;
  reason?: string;
}

export interface LockClient {
  newsSyncLock: {
    upsert: (args: {
      where: { id: string };
      create: { id: string };
      update: Record<string, unknown>;
    }) => Promise<unknown>;
    updateMany: (args: {
      where: {
        id: string;
        lockedBy?: string;
        lockedUntil?: { gte?: Date; lt?: Date };
        OR?: Array<{ lockedUntil: null | { lt: Date } }>;
      };
      data: { lockedUntil: Date | null; lockedBy?: string | null };
    }) => Promise<{ count: number }>;
    findUnique?: (args: { where: { id: string } }) => Promise<unknown>;
  };
}

/**
 * Generate a unique worker/job execution token.
 */
export function generateWorkerId(prefix = "news-worker"): string {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Atomically acquire the synchronization lock.
 */
export async function acquireSyncLock(
  lockId: string = DEFAULT_LOCK_ID,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
  workerId: string = generateWorkerId(),
  now: Date = new Date(),
  client: LockClient = defaultPrisma as unknown as LockClient,
): Promise<LockAcquisitionResult> {
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  try {
    // 1. Ensure the singleton lock row exists idempotently
    await client.newsSyncLock.upsert({
      where: { id: lockId },
      create: { id: lockId },
      update: {},
    });

    // 2. Perform atomic conditional lease acquisition
    const result = await client.newsSyncLock.updateMany({
      where: {
        id: lockId,
        OR: [
          { lockedUntil: null },
          { lockedUntil: { lt: now } },
        ],
      },
      data: {
        lockedUntil: leaseExpiresAt,
        lockedBy: workerId,
      },
    });

    if (result.count === 1) {
      logger.info("news_sync_lock_acquired", { lockId, workerId, leaseExpiresAt: leaseExpiresAt.toISOString() });
      return {
        acquired: true,
        lockId,
        workerId,
        leaseExpiresAt,
      };
    }

    logger.info("news_sync_lock_contended", { lockId, workerId });
    return {
      acquired: false,
      lockId,
      workerId,
      reason: "Lock is currently active and held by another concurrent worker.",
    };
  } catch (err) {
    logger.error("news_sync_lock_acquire_failed", {
      lockId,
      workerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      acquired: false,
      lockId,
      workerId,
      reason: `Failed to acquire lock due to error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Atomically release a synchronization lock with strict ownership verification.
 */
export async function releaseSyncLock(
  lockId: string = DEFAULT_LOCK_ID,
  workerId: string,
  client: LockClient = defaultPrisma as unknown as LockClient,
): Promise<boolean> {
  try {
    const result = await client.newsSyncLock.updateMany({
      where: {
        id: lockId,
        lockedBy: workerId, // STRICT: Only the current owner can release
      },
      data: {
        lockedUntil: null,
        lockedBy: null,
      },
    });

    const released = result.count === 1;
    if (released) {
      logger.info("news_sync_lock_released", { lockId, workerId });
    } else {
      logger.warn("news_sync_lock_release_rejected", {
        lockId,
        workerId,
        reason: "Lock was either not held by this worker or has already expired and been reclaimed.",
      });
    }
    return released;
  } catch (err) {
    logger.error("news_sync_lock_release_failed", {
      lockId,
      workerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Atomically renew an active synchronization lock with ownership check.
 */
export async function renewSyncLock(
  lockId: string = DEFAULT_LOCK_ID,
  workerId: string,
  extensionMs: number = DEFAULT_LEASE_DURATION_MS,
  now: Date = new Date(),
  client: LockClient = defaultPrisma as unknown as LockClient,
): Promise<boolean> {
  const newLeaseExpiresAt = new Date(now.getTime() + extensionMs);

  try {
    const result = await client.newsSyncLock.updateMany({
      where: {
        id: lockId,
        lockedBy: workerId,
        lockedUntil: { gte: now }, // STRICT: Must still be active
      },
      data: {
        lockedUntil: newLeaseExpiresAt,
      },
    });

    const renewed = result.count === 1;
    if (renewed) {
      logger.info("news_sync_lock_renewed", { lockId, workerId, newLeaseExpiresAt: newLeaseExpiresAt.toISOString() });
    } else {
      logger.warn("news_sync_lock_renewal_rejected", {
        lockId,
        workerId,
        reason: "Cannot renew lock: lease has expired or is held by another worker.",
      });
    }
    return renewed;
  } catch (err) {
    logger.error("news_sync_lock_renewal_failed", {
      lockId,
      workerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Higher-order lock execution wrapper (RAII pattern).
 * Acquires lock, executes task, and guarantees lease release.
 */
export async function withSyncLock<T>(
  task: (context: { lockId: string; workerId: string; leaseExpiresAt: Date }) => Promise<T>,
  options: {
    lockId?: string;
    leaseDurationMs?: number;
    workerId?: string;
    client?: LockClient;
  } = {},
): Promise<{ executed: boolean; result?: T; reason?: string }> {
  const lockId = options.lockId ?? DEFAULT_LOCK_ID;
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const workerId = options.workerId ?? generateWorkerId();
  const client = options.client ?? (defaultPrisma as unknown as LockClient);

  const acquisition = await acquireSyncLock(lockId, leaseDurationMs, workerId, new Date(), client);
  if (!acquisition.acquired || !acquisition.leaseExpiresAt) {
    return {
      executed: false,
      reason: acquisition.reason || "Failed to acquire synchronization lock.",
    };
  }

  try {
    const result = await task({
      lockId,
      workerId,
      leaseExpiresAt: acquisition.leaseExpiresAt,
    });
    return {
      executed: true,
      result,
    };
  } finally {
    await releaseSyncLock(lockId, workerId, client);
  }
}
