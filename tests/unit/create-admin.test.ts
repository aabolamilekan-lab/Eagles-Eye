import { describe, expect, it } from "vitest";

import {
  parseCreateAdminArgs,
  resolveCreateAdmin,
  type ParsedArgs,
} from "../../scripts/create-admin";

/**
 * Create-admin contract: locks the credential handling the deployment relies
 * on (environment-only credentials, explicit confirmation of the target
 * account, Argon2id-length passwords, and no password in any failure reason).
 *
 * The database side effects are covered by the integration suite; this file
 * covers the validation that decides whether they may happen at all.
 */

const PASSWORD = "correct horse battery staple";

function argsOf(...argv: string[]): ParsedArgs {
  return parseCreateAdminArgs(argv);
}

function resolve(
  env: Record<string, string | undefined>,
  argv: string[] = ["--confirm=ops@example.com"],
): ReturnType<typeof resolveCreateAdmin> {
  return resolveCreateAdmin(env, parseCreateAdminArgs(argv));
}

function validEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ADMIN_EMAIL: "ops@example.com",
    ADMIN_PASSWORD: PASSWORD,
    ...extra,
  };
}

describe("create-admin argument parsing", () => {
  it("reads --confirm and --update", () => {
    expect(argsOf("--confirm=ops@example.com", "--update")).toEqual({
      confirm: "ops@example.com",
      update: true,
    });
  });

  it("defaults to no update and no confirmation", () => {
    expect(argsOf()).toEqual({ confirm: null, update: false });
  });

  it("trims whitespace around the confirmation", () => {
    expect(argsOf("--confirm= ops@example.com ").confirm).toBe("ops@example.com");
  });

  it("rejects unknown arguments instead of ignoring a typo", () => {
    expect(() => argsOf("--cfonrm=ops@example.com")).toThrow("Unknown argument");
    expect(() => argsOf("ops@example.com")).toThrow("Unknown argument");
  });
});

describe("create-admin configuration", () => {
  it("accepts a well-formed request and normalizes the email", () => {
    const result = resolve({ ...validEnv(), ADMIN_EMAIL: "  OPS@Example.com " });

    expect(result).toEqual({
      ok: true,
      options: {
        email: "ops@example.com",
        name: "ops",
        password: PASSWORD,
        update: false,
      },
    });
  });

  it("uses ADMIN_NAME when supplied and the email local part otherwise", () => {
    const named = resolve(validEnv({ ADMIN_NAME: "  Ola Amuda " }));
    expect(named.ok && named.options.name).toBe("Ola Amuda");

    const derived = resolve(validEnv());
    expect(derived.ok && derived.options.name).toBe("ops");
  });

  it("rejects a missing or malformed email", () => {
    expect(resolveCreateAdmin({}, argsOf("--confirm=ops@example.com"))).toEqual({
      ok: false,
      reason: "ADMIN_EMAIL is missing or is not a valid email address.",
    });

    expect(resolve(validEnv({ ADMIN_EMAIL: "not-an-email" }))).toEqual({
      ok: false,
      reason: "ADMIN_EMAIL is missing or is not a valid email address.",
    });
  });

  it("rejects a password below the Argon2id length floor", () => {
    const result = resolve(validEnv({ ADMIN_PASSWORD: "short" }));

    expect(result).toEqual({
      ok: false,
      reason: "ADMIN_PASSWORD must be at least 12 characters.",
    });
  });

  it("requires the target email to be repeated as --confirm", () => {
    expect(resolve(validEnv(), [])).toEqual({
      ok: false,
      reason: "Re-run with --confirm=ops@example.com to state which account to create.",
    });
  });

  it("rejects a --confirm that names a different account", () => {
    expect(resolve(validEnv(), ["--confirm=someone@example.com"])).toEqual({
      ok: false,
      reason: "--confirm does not match ADMIN_EMAIL.",
    });
  });

  it("rejects an over-long display name", () => {
    const result = resolve(validEnv({ ADMIN_NAME: "n".repeat(121) }));

    expect(result).toEqual({
      ok: false,
      reason: "ADMIN_NAME must be at most 120 characters.",
    });
  });

  it("never echoes the password in any failure reason", () => {
    const failures = [
      resolveCreateAdmin({}, argsOf("--confirm=ops@example.com")),
      resolve(validEnv({ ADMIN_EMAIL: "broken" })),
      resolve(validEnv({ ADMIN_PASSWORD: "short" })),
      resolve(validEnv(), []),
      resolve(validEnv(), ["--confirm=other@example.com"]),
    ];

    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      if (!failure.ok) {
        expect(failure.reason).not.toContain(PASSWORD);
        expect(failure.reason).not.toContain("ADMIN_PASSWORD=");
      }
    }
  });
});
