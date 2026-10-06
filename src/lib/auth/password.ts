import { hash, verify } from "@node-rs/argon2";
import type { Options } from "@node-rs/argon2";

/**
 * Password hashing.
 *
 * Argon2id at the policy parameters from the authentication skill. The encoded
 * output is self-describing (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), so
 * `verifyPassword` reads the parameters from the stored hash and a policy
 * increase does not invalidate existing hashes — it triggers an upgrade on the
 * next successful sign-in.
 *
 * Never log or return a hash. This module has one job.
 */

/**
 * `Algorithm` is an ambient const enum in the NAPI binding; `isolatedModules`
 * forbids reading it as a value. Argon2id is the numeric variant 2 there, and
 * pinning it explicitly means a library default change cannot silently weaken
 * or alter the algorithm.
 */
const ARGON2ID = 2 as NonNullable<Options["algorithm"]>;

export const PASSWORD_POLICY = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export interface PasswordPolicy {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

const ENCODED_PARAMS = /\$m=(\d+),t=(\d+),p=(\d+)\$/;

/**
 * True when a stored hash was produced with weaker parameters than the current
 * policy, or cannot be parsed. A true result means the password should be
 * re-hashed on the next successful verify.
 */
export function passwordNeedsRehash(
  encoded: string,
  policy: PasswordPolicy = PASSWORD_POLICY,
): boolean {
  const match = ENCODED_PARAMS.exec(encoded);
  if (!match) {
    return true;
  }

  const [, memoryCost, timeCost, parallelism] = match;
  return (
    Number(memoryCost) < policy.memoryCost ||
    Number(timeCost) < policy.timeCost ||
    Number(parallelism) < policy.parallelism
  );
}

/** Hash a plaintext password. The result is the only thing ever stored. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_POLICY);
}

export interface VerifyResult {
  valid: boolean;
  /** Set only on success, when the stored hash is below the current policy. */
  needsRehash: boolean;
}

/**
 * Verify a password against a stored hash.
 *
 * A malformed or tampered hash is treated as a normal failure, never an error
 * that reaches the caller. The parameters are read from the stored hash, not
 * from a constant, so old hashes keep verifying.
 */
export async function verifyPassword(
  encoded: string,
  password: string,
): Promise<VerifyResult> {
  let valid = false;

  try {
    valid = await verify(encoded, password);
  } catch {
    valid = false;
  }

  if (!valid) {
    return { valid: false, needsRehash: false };
  }

  return { valid: true, needsRehash: passwordNeedsRehash(encoded) };
}

let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("eagles-eye-dummy-password-not-a-credential");
  return dummyHash;
}

/**
 * Spend roughly the same time as a real verify when the account does not exist,
 * so response timing does not enumerate accounts. The dummy hash is generated
 * once per process and is not a credential.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  try {
    await verify(await getDummyHash(), password);
  } catch {
    // A malformed dummy is not reachable; ignore defensively.
  }
}
