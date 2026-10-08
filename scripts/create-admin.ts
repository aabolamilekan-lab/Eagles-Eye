import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";
import { loginSchema } from "../src/lib/validation/auth";
import { ACCOUNT_NAME_MAX, PASSWORD_MIN } from "../src/lib/validation/user";

/**
 * Administrator bootstrap.
 *
 * The development seed refuses to run in production, so a deployed environment
 * has no way to gain its first administrator. This script is that way: it
 * creates one `ADMIN` account from environment variables, or replaces an
 * existing account's password on explicit request.
 *
 * Deliberate properties:
 *
 * - Credentials arrive as environment variables, never command-line arguments,
 *   so the password never appears in a process listing or shell history.
 * - The target email must be repeated as `--confirm=<email>`. A stale variable
 *   from a previous deploy cannot create an account nobody meant to create.
 * - The password is hashed with the same Argon2id policy the application uses
 *   and is never written to stdout, stderr, or the log.
 * - An existing account is never modified without `--update`, and `--update`
 *   changes only the password, revoking every session for that account.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *     npm run admin:create -- --confirm=admin@example.com [--update]
 *
 * AGENTS.md sections 7, 12 and 13. `.agent/skills/deployment/SKILL.md`.
 */

const PASSWORD_MAX = 1024;

export interface CreateAdminOptions {
  email: string;
  /** Display name for the account. `ADMIN_NAME` when set, else the email's local part. */
  name: string;
  password: string;
  update: boolean;
}

export type ResolveResult =
  | { ok: true; options: CreateAdminOptions }
  | { ok: false; reason: string };

export interface ParsedArgs {
  confirm: string | null;
  update: boolean;
}

/** Parse the script's own arguments. Unknown flags are a typo, not a maybe. */
export function parseCreateAdminArgs(argv: readonly string[]): ParsedArgs {
  let confirm: string | null = null;
  let update = false;

  for (const arg of argv) {
    if (arg === "--update") {
      update = true;
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      confirm = arg.slice("--confirm=".length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { confirm, update };
}

/**
 * Validate the environment and arguments into a ready-to-run configuration.
 *
 * Returns a reason instead of throwing so the caller controls the exit path.
 * The reason never contains the password.
 */
export function resolveCreateAdmin(
  env: Record<string, string | undefined>,
  args: ParsedArgs,
): ResolveResult {
  const rawEmail = env.ADMIN_EMAIL ?? "";
  const password = env.ADMIN_PASSWORD ?? "";

  const email = loginSchema.shape.email.safeParse(rawEmail);
  if (!email.success) {
    return { ok: false, reason: "ADMIN_EMAIL is missing or is not a valid email address." };
  }

  const suppliedName = (env.ADMIN_NAME ?? "").trim();
  const separator = email.data.indexOf("@");
  const derivedName = separator > 0 ? email.data.slice(0, separator) : email.data;
  const name = suppliedName === "" ? derivedName : suppliedName;
  if (name.length > ACCOUNT_NAME_MAX) {
    return {
      ok: false,
      reason: `ADMIN_NAME must be at most ${ACCOUNT_NAME_MAX} characters.`,
    };
  }

  if (password.length < PASSWORD_MIN) {
    return {
      ok: false,
      reason: `ADMIN_PASSWORD must be at least ${PASSWORD_MIN} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX) {
    return {
      ok: false,
      reason: `ADMIN_PASSWORD must be at most ${PASSWORD_MAX} characters.`,
    };
  }

  if (args.confirm === null || args.confirm === "") {
    return {
      ok: false,
      reason: `Re-run with --confirm=${email.data} to state which account to create.`,
    };
  }
  if (args.confirm.toLowerCase() !== email.data) {
    return { ok: false, reason: "--confirm does not match ADMIN_EMAIL." };
  }

  return { ok: true, options: { email: email.data, name, password, update: args.update } };
}

function abort(message: string): never {
  process.stderr.write(`create-admin: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseCreateAdminArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid arguments.";
    abort(message);
  }

  const resolved = resolveCreateAdmin(process.env, parsed);
  if (!resolved.ok) {
    abort(resolved.reason);
  }

  const { email, name, password, update } = resolved.options;
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing === null) {
      await prisma.user.create({
        data: {
          email,
          name,
          passwordHash: await hashPassword(password),
          role: UserRole.ADMIN,
          isActive: true,
        },
        select: { id: true },
      });
      process.stderr.write(`create-admin: created administrator ${email}.\n`);
      return;
    }

    if (!update) {
      abort(
        `an account for ${email} already exists. Re-run with --update to replace its password.`,
      );
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    // Changing a password invalidates every session for that account.
    await prisma.session.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    process.stderr.write(`create-admin: replaced the password for ${email}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.VITEST !== "true") {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write(`create-admin failed: ${message}\n`);
    process.exitCode = 1;
  });
}
