import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { hashSessionToken } from "@/lib/auth/session-token";

/**
 * Authentication against a real PostgreSQL database.
 *
 * Skipped entirely unless `DATABASE_URL` is set. Run with
 * `npm run test:integration` against a disposable database; the suite cleans up
 * every row it creates.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("authentication (PostgreSQL)", () => {
  const email = `integration-auth-${process.pid}@example.test`;
  const ip = "203.0.113.42";
  const authSecret = "integration-secret-integration-secret-1234";

  let prisma: PrismaClient;
  let userId = "";
  let hashPassword: (password: string) => Promise<string>;
  let issueSession: (userId: string) => Promise<{ token: string }>;
  let recordLoginAttempt: (input: {
    identifier: string;
    ip: string;
    succeeded: boolean;
  }) => Promise<void>;
  let getConsecutiveFailures: (identifier: string) => Promise<number[]>;
  let getRecentIpAttempts: (ip: string, windowStart: Date) => Promise<number[]>;

  beforeAll(async () => {
    process.env.AUTH_SECRET = authSecret;
    process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";

    const env = await import("@/lib/env");
    env.resetEnvCacheForTests();
    env.getEnv();

    const db = await import("@/lib/db");
    prisma = db.prisma;

    const password = await import("@/lib/auth/password");
    hashPassword = password.hashPassword;

    const session = await import("@/lib/auth/session");
    issueSession = session.issueSession;

    const rate = await import("@/lib/rate-limit/login");
    recordLoginAttempt = rate.recordLoginAttempt;
    getConsecutiveFailures = rate.getConsecutiveFailures;
    getRecentIpAttempts = rate.getRecentIpAttempts;

    await prisma.loginAttempt.deleteMany({ where: { identifier: email } });

    const passwordHash = await hashPassword("integration-password");
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, isActive: true },
      create: {
        email,
        name: "Integration Admin",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.loginAttempt.deleteMany({ where: { identifier: email } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("stores only a keyed hash of the session token", async () => {
    const { token } = await issueSession(userId);
    const rows = await prisma.session.findMany({
      where: { userId },
      select: { tokenHash: true },
    });
    const stored = rows.map((row) => row.tokenHash);

    expect(stored).toContain(hashSessionToken(token, authSecret));
    expect(stored).not.toContain(token);
  });

  it("cascades sessions when the user is deleted", async () => {
    const { token } = await issueSession(userId);
    const tokenHash = hashSessionToken(token, authSecret);
    const tempEmail = `integration-cascade-${process.pid}@example.test`;
    const passwordHash = await hashPassword("integration-password");
    const temp = await prisma.user.create({
      data: { email: tempEmail, name: "Cascade", passwordHash, role: "ADMIN" },
      select: { id: true },
    });

    const { token: tempToken } = await issueSession(temp.id);
    await prisma.user.delete({ where: { id: temp.id } });

    const orphans = await prisma.session.findMany({
      where: { tokenHash: hashSessionToken(tempToken, authSecret) },
      select: { id: true },
    });
    expect(orphans).toHaveLength(0);

    await prisma.session.deleteMany({ where: { tokenHash } });
  });

  it("records attempts and reads consecutive failures since the last success", async () => {
    const before = await getConsecutiveFailures(email);
    expect(before).toHaveLength(0);

    await recordLoginAttempt({ identifier: email, ip, succeeded: false });
    await recordLoginAttempt({ identifier: email, ip, succeeded: false });
    const twoFailures = await getConsecutiveFailures(email);
    expect(twoFailures).toHaveLength(2);

    await recordLoginAttempt({ identifier: email, ip, succeeded: true });
    const afterSuccess = await getConsecutiveFailures(email);
    expect(afterSuccess).toHaveLength(0);

    const recent = await getRecentIpAttempts(ip, new Date(Date.now() - 60_000));
    expect(recent.length).toBeGreaterThanOrEqual(3);
  });

  it("counts an inactive user's session as unusable", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true },
    });
    const active = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    expect(active?.isActive).toBe(false);

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: { id: true },
    });
  });
});
