import { describe, expect, it } from "vitest";
import {
  PASSWORD_POLICY,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/lib/auth/password";

const WEAK_HASH =
  "$argon2id$v=19$m=1024,t=1,p=1$c2FsdHNhbHR2YWx1ZQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("password", () => {
  it("hashes with Argon2id and never returns the plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded).toMatch(/^\$argon2id\$v=19\$/);
    expect(encoded).not.toContain("correct horse battery staple");
    expect(encoded).not.toBe(WEAK_HASH);
  });

  it("produces a different hash each time (random salt)", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toBe(second);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const encoded = await hashPassword("s3cret-passphrase");
    await expect(verifyPassword(encoded, "s3cret-passphrase")).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
    await expect(verifyPassword(encoded, "wrong")).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("treats a malformed hash as a normal failure, not an error", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
    await expect(verifyPassword("", "anything")).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("flags hashes below the current policy for rehash", () => {
    expect(passwordNeedsRehash(WEAK_HASH)).toBe(true);
    expect(passwordNeedsRehash("garbage")).toBe(true);
    expect(passwordNeedsRehash(WEAK_HASH, { memoryCost: 1024, timeCost: 1, parallelism: 1 })).toBe(
      false,
    );
  });

  it("does not flag a hash produced at the current policy", async () => {
    const encoded = await hashPassword("policy-check");
    expect(
      passwordNeedsRehash(encoded, {
        memoryCost: PASSWORD_POLICY.memoryCost,
        timeCost: PASSWORD_POLICY.timeCost,
        parallelism: PASSWORD_POLICY.parallelism,
      }),
    ).toBe(false);
  });
});
