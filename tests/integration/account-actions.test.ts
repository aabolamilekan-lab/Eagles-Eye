import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * Account settings against a real PostgreSQL database.
 *
 * Skipped unless `DATABASE_URL` is set. The two dimensions the unit tests
 * cannot prove are exercised here: the actor is always the session's own user
 * id (never a form id), and a password change revokes every other session while
 * minting one fresh session for the current request. The guards and the request
 * cookie are mocked at their boundaries; everything else is real.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const { RedirectError, session } = vi.hoisted(() => {
  class RedirectError extends Error {
    readonly url: string;
    constructor(url: string) {
      super(`redirect:${url}`);
      this.name = "RedirectError";
      this.url = url;
    }
  }
  return { RedirectError, session: { userId: "" } };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: vi.fn(async () => ({ userId: session.userId })),
  requireWriteCapability: vi.fn(async () => ({ userId: session.userId })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

import { requireWriteCapability } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { issueSession } from "@/lib/auth/session";
import { INITIAL_ACCOUNT_FORM_STATE } from "@/lib/account/form";

type AccountActions = typeof import("@/actions/account");

const INITIAL = INITIAL_ACCOUNT_FORM_STATE;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) {
      return error.url;
    }
    throw error;
  }
  throw new Error("expected the action to redirect");
}

describe.skipIf(!hasDatabase)("account actions (PostgreSQL)", () => {
  const email = `iacct-${process.pid}@example.test`;
  const currentPassword = "current-passphrase-1";
  const newPassword = "brand-new-passphrase-2";

  let prisma: PrismaClient;
  let accountActions: AccountActions;
  let userId = "";

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    accountActions = await import("@/actions/account");

    await prisma.user.deleteMany({ where: { email } });
    const user = await prisma.user.create({
      data: {
        name: "Fixture Admin",
        email,
        passwordHash: await hashPassword(currentPassword),
      },
      select: { id: true },
    });
    userId = user.id;
    session.userId = userId;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("re-checks settings.manage before updating the profile", async () => {
    vi.mocked(requireWriteCapability).mockClear();

    await expectRedirect(() =>
      accountActions.updateProfileAction(INITIAL, form({ name: "Renamed Admin" })),
    );

    expect(requireWriteCapability).toHaveBeenCalledWith("settings.manage");
  });

  it("updates the signed-in administrator's own display name", async () => {
    const url = await expectRedirect(() =>
      accountActions.updateProfileAction(
        INITIAL,
        form({ name: "  Renamed Admin  " }),
      ),
    );

    expect(url).toContain("notice=profile_saved");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    expect(user?.name).toBe("Renamed Admin");
  });

  it("rejects a blank name without writing", async () => {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const state = await accountActions.updateProfileAction(
      INITIAL,
      form({ name: "   " }),
    );
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.name).toBeDefined();

    const after = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    expect(after?.name).toBe(before?.name);
  });

  it("refuses a wrong current password and leaves the hash unchanged", async () => {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    const state = await accountActions.changePasswordAction(
      INITIAL,
      form({
        currentPassword: "not-the-current-password",
        newPassword,
        confirmPassword: newPassword,
      }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.currentPassword).toBeDefined();

    const after = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    expect(after?.passwordHash).toBe(before?.passwordHash);
  });

  it("changes the password, revokes other sessions, and keeps this one signed in", async () => {
    // Two existing sessions stand in for other devices.
    await issueSession(userId);
    await issueSession(userId);

    const url = await expectRedirect(() =>
      accountActions.changePasswordAction(
        INITIAL,
        form({
          currentPassword,
          newPassword,
          confirmPassword: newPassword,
        }),
      ),
    );
    expect(url).toContain("notice=password_changed");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    expect(user).not.toBeNull();
    expect((await verifyPassword(user!.passwordHash, newPassword)).valid).toBe(
      true,
    );
    expect((await verifyPassword(user!.passwordHash, currentPassword)).valid).toBe(
      false,
    );

    const active = await prisma.session.count({
      where: { userId, revokedAt: null },
    });
    expect(active).toBe(1);
  });
});