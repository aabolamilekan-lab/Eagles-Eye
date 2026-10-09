import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * Transient database failure policy.
 *
 * Managed, pooled PostgreSQL can reject a query for reasons that say nothing
 * about correctness: the server is briefly unreachable (`P1001`), the
 * connection timed out or closed (`P1002`/`P1003`), or the pool waited past its
 * timeout for a free connection (`P2024`). These are safe to retry for reads,
 * which are idempotent.
 *
 * Writes are never retried here. A connection error after a write may be
 * ambiguous (the statement may have committed), so retrying could double-apply.
 */

const TRANSIENT_DB_CODES = new Set(["P1001", "P1002", "P1003", "P2024"]);

const RETRYABLE_READ_OPERATIONS = new Set([
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);

const MAX_DB_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

export function isTransientDbError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    TRANSIENT_DB_CODES.has(error.code)
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runWithTransientRetry<T>(
  operation: string,
  execute: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_DB_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? RETRY_BASE_DELAY_MS;

  let attempt = 1;
  for (;;) {
    try {
      return await execute();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientDbError(error)) {
        throw error;
      }
      logger.warn("db.retry_transient_read", { operation, attempt });
      await wait(baseDelayMs * 2 ** (attempt - 1));
      attempt += 1;
    }
  }
}

export const retryTransientReadsExtension = Prisma.defineExtension({
  name: "resilient-transient-reads",
  query: {
    async $allOperations({ operation, args, query }) {
      const run = () => query(args);
      if (!RETRYABLE_READ_OPERATIONS.has(operation)) {
        return run();
      }
      return runWithTransientRetry(operation, run);
    },
  },
});
