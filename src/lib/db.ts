import { PrismaClient } from "@prisma/client";
import { withResilientConnectionParams } from "@/lib/database-url";
import { retryTransientReadsExtension } from "@/lib/db-retry";

/**
 * Prisma client singleton.
 *
 * One instance per process. Parked on `globalThis` in development so Next.js
 * hot reload cannot exhaust the connection pool. Prisma reads `DATABASE_URL`
 * from the environment directly and the value is never logged. This is the only
 * module allowed to construct a client.
 *
 * The client is wrapped with a small resilience policy aimed at managed,
 * pooled PostgreSQL:
 *
 * - `withResilientConnectionParams` adds pool and connect timeouts unless the
 *   operator set them, so the driver waits for a free connection and for a cold
 *   compute to wake instead of failing immediately.
 * - `retryTransientReadsExtension` retries read operations, with backoff, on
 *   the transient connection errors defined in `@/lib/db-retry`. Writes are
 *   never retried automatically.
 */

function createPrismaClient(): PrismaClient {
  const url = withResilientConnectionParams(process.env.DATABASE_URL);
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  }).$extends(retryTransientReadsExtension);

  // `$extends` keeps the base API at runtime but changes the structural type,
  // which would otherwise break the transaction helper signatures that accept
  // `Prisma.TransactionClient`. The extension only adds query hooks for the
  // retry policy above; every method this codebase uses is unchanged, so we
  // present the base type to call sites.
  return client as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
