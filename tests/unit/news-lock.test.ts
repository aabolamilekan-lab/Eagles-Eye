import { describe, expect, it } from "vitest";
import {
  acquireSyncLock,
  generateWorkerId,
  releaseSyncLock,
  renewSyncLock,
  withSyncLock,
  type LockClient,
} from "@/lib/news/lock";

function createMockLockClient(initialState?: {
  id?: string;
  lockedUntil?: Date | null;
  lockedBy?: string | null;
}): { client: LockClient; state: { id: string; lockedUntil: Date | null; lockedBy: string | null } } {
  const state = {
    id: initialState?.id ?? "global_news_sync",
    lockedUntil: initialState?.lockedUntil ?? null,
    lockedBy: initialState?.lockedBy ?? null,
  };

  const client: LockClient = {
    newsSyncLock: {
      upsert: async () => state,
      updateMany: async (args: {
        where: {
          id: string;
          lockedBy?: string;
          lockedUntil?: { gte?: Date; lt?: Date };
          OR?: Array<{ lockedUntil: null | { lt: Date } }>;
        };
        data: { lockedUntil: Date | null; lockedBy?: string | null };
      }) => {
        const { where, data } = args;
        if (where.id !== state.id) return { count: 0 };

        // Check ownership constraint if specified
        if (where.lockedBy !== undefined && where.lockedBy !== state.lockedBy) {
          return { count: 0 };
        }

        // Check lockedUntil condition if specified
        if (where.lockedUntil?.gte !== undefined) {
          if (!state.lockedUntil || state.lockedUntil.getTime() < where.lockedUntil.gte.getTime()) {
            return { count: 0 };
          }
        }

        // Check OR condition for acquisition: lockedUntil is null OR lockedUntil < now
        if (where.OR) {
          const isNull = state.lockedUntil === null;
          const isExpired =
            state.lockedUntil !== null &&
            where.OR.some(
              (cond) =>
                cond &&
                typeof cond === "object" &&
                "lockedUntil" in cond &&
                cond.lockedUntil &&
                typeof cond.lockedUntil === "object" &&
                "lt" in cond.lockedUntil &&
                state.lockedUntil!.getTime() < (cond.lockedUntil.lt as Date).getTime(),
            );

          if (!isNull && !isExpired) {
            return { count: 0 };
          }
        }

        // Apply update
        state.lockedUntil = data.lockedUntil;
        if (data.lockedBy !== undefined) {
          state.lockedBy = data.lockedBy;
        }
        return { count: 1 };
      },
    },
  };

  return { client, state };
}

describe("News Sync Lock - Acquisition & Contention", () => {
  it("acquires lock successfully when lock is free", async () => {
    const { client, state } = createMockLockClient();
    const workerId = generateWorkerId("test");
    const now = new Date("2026-10-12T12:00:00Z");

    const result = await acquireSyncLock("global_news_sync", 30_000, workerId, now, client);

    expect(result.acquired).toBe(true);
    expect(result.workerId).toBe(workerId);
    expect(result.leaseExpiresAt?.toISOString()).toBe("2026-10-12T12:00:30.000Z");
    expect(state.lockedBy).toBe(workerId);
    expect(state.lockedUntil?.toISOString()).toBe("2026-10-12T12:00:30.000Z");
  });

  it("rejects acquisition when another worker holds an active lease (contention)", async () => {
    const activeUntil = new Date("2026-10-12T12:01:00Z");
    const { client } = createMockLockClient({
      lockedUntil: activeUntil,
      lockedBy: "worker-active-99",
    });

    const now = new Date("2026-10-12T12:00:30Z"); // 30 seconds before lease expires
    const newWorkerId = generateWorkerId("contender");

    const result = await acquireSyncLock("global_news_sync", 30_000, newWorkerId, now, client);

    expect(result.acquired).toBe(false);
    expect(result.reason).toContain("Lock is currently active");
  });

  it("reclaims lock when existing lease has expired", async () => {
    const expiredUntil = new Date("2026-10-12T11:59:00Z"); // 1 minute in the past
    const { client, state } = createMockLockClient({
      lockedUntil: expiredUntil,
      lockedBy: "stale-dead-worker",
    });

    const now = new Date("2026-10-12T12:00:00Z");
    const newWorkerId = generateWorkerId("recoverer");

    const result = await acquireSyncLock("global_news_sync", 45_000, newWorkerId, now, client);

    expect(result.acquired).toBe(true);
    expect(result.workerId).toBe(newWorkerId);
    expect(state.lockedBy).toBe(newWorkerId);
    expect(state.lockedUntil?.toISOString()).toBe("2026-10-12T12:00:45.000Z");
  });
});

describe("News Sync Lock - Ownership-Checked Release & Renewal", () => {
  it("releases lock when called by current owner", async () => {
    const ownerWorkerId = "owner-123";
    const { client, state } = createMockLockClient({
      lockedUntil: new Date("2026-10-12T12:05:00Z"),
      lockedBy: ownerWorkerId,
    });

    const released = await releaseSyncLock("global_news_sync", ownerWorkerId, client);

    expect(released).toBe(true);
    expect(state.lockedUntil).toBeNull();
    expect(state.lockedBy).toBeNull();
  });

  it("rejects release when called by a non-owner / stale worker", async () => {
    const currentOwner = "worker-new-active";
    const staleWorker = "worker-stale-old";
    const activeUntil = new Date("2026-10-12T12:05:00Z");

    const { client, state } = createMockLockClient({
      lockedUntil: activeUntil,
      lockedBy: currentOwner,
    });

    const released = await releaseSyncLock("global_news_sync", staleWorker, client);

    expect(released).toBe(false);
    // Crucial: Active lock must NOT be disturbed!
    expect(state.lockedBy).toBe(currentOwner);
    expect(state.lockedUntil).toBe(activeUntil);
  });

  it("renews lock when called by active owner", async () => {
    const ownerWorkerId = "owner-123";
    const initialUntil = new Date("2026-10-12T12:01:00Z");
    const now = new Date("2026-10-12T12:00:30Z");

    const { client, state } = createMockLockClient({
      lockedUntil: initialUntil,
      lockedBy: ownerWorkerId,
    });

    const renewed = await renewSyncLock("global_news_sync", ownerWorkerId, 60_000, now, client);

    expect(renewed).toBe(true);
    expect(state.lockedUntil?.toISOString()).toBe("2026-10-12T12:01:30.000Z");
  });

  it("rejects renewal when lease has already expired", async () => {
    const ownerWorkerId = "owner-123";
    const expiredUntil = new Date("2026-10-12T11:59:00Z");
    const now = new Date("2026-10-12T12:00:00Z");

    const { client } = createMockLockClient({
      lockedUntil: expiredUntil,
      lockedBy: ownerWorkerId,
    });

    const renewed = await renewSyncLock("global_news_sync", ownerWorkerId, 60_000, now, client);

    expect(renewed).toBe(false);
  });
});

describe("News Sync Lock - withSyncLock RAII Runner", () => {
  it("executes task and automatically releases lock upon completion", async () => {
    const { client, state } = createMockLockClient();
    let taskExecuted = false;

    const runResult = await withSyncLock(
      async (ctx) => {
        taskExecuted = true;
        expect(ctx.workerId).toBeTruthy();
        expect(state.lockedBy).toBe(ctx.workerId);
        return "SUCCESS_DATA";
      },
      { client },
    );

    expect(runResult.executed).toBe(true);
    expect(runResult.result).toBe("SUCCESS_DATA");
    expect(taskExecuted).toBe(true);
    // Verified released
    expect(state.lockedBy).toBeNull();
    expect(state.lockedUntil).toBeNull();
  });

  it("guarantees lock release even if the task throws an error", async () => {
    const { client, state } = createMockLockClient();

    await expect(
      withSyncLock(
        async () => {
          throw new Error("Task unexpectedly failed inside critical section");
        },
        { client },
      ),
    ).rejects.toThrow("Task unexpectedly failed inside critical section");

    // Verified released even after error
    expect(state.lockedBy).toBeNull();
    expect(state.lockedUntil).toBeNull();
  });
});
