import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { isTransientDbError, runWithTransientRetry } from "@/lib/db-retry";

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "6.12.0",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isTransientDbError", () => {
  it("recognises transient connection codes", () => {
    for (const code of ["P1001", "P1002", "P1003", "P2024"]) {
      expect(isTransientDbError(knownError(code))).toBe(true);
    }
  });

  it("ignores unrelated errors", () => {
    expect(isTransientDbError(knownError("P2002"))).toBe(false);
    expect(isTransientDbError(new Error("plain"))).toBe(false);
  });
});

describe("runWithTransientRetry", () => {
  it("returns the first successful result without retrying", async () => {
    const execute = vi.fn().mockResolvedValue("ok");
    await expect(
      runWithTransientRetry("findMany", execute, {
        maxAttempts: 3,
        baseDelayMs: 0,
      }),
    ).resolves.toBe("ok");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and then succeeds", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const execute = vi
      .fn()
      .mockRejectedValueOnce(knownError("P2024"))
      .mockResolvedValueOnce("recovered");

    await expect(
      runWithTransientRetry("count", execute, {
        maxAttempts: 3,
        baseDelayMs: 0,
      }),
    ).resolves.toBe("recovered");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("db.retry_transient_read", {
      operation: "count",
      attempt: 1,
    });
  });

  it("gives up after the attempt ceiling and rethrows", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const execute = vi.fn().mockRejectedValue(knownError("P1001"));

    await expect(
      runWithTransientRetry("findUnique", execute, {
        maxAttempts: 3,
        baseDelayMs: 0,
      }),
    ).rejects.toMatchObject({ code: "P1001" });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient failure", async () => {
    const execute = vi.fn().mockRejectedValue(knownError("P2002"));

    await expect(
      runWithTransientRetry("findFirst", execute, {
        maxAttempts: 3,
        baseDelayMs: 0,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
