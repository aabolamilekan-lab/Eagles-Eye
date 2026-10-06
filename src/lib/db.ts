import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * One instance per process. Parked on `globalThis` in development so Next.js
 * hot reload cannot exhaust the connection pool. Prisma reads `DATABASE_URL`
 * from the environment directly and the value is never logged. This is the only
 * module allowed to construct a client.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
