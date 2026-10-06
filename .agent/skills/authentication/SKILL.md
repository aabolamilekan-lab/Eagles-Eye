# Skill: Authentication

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md section 7 states the requirements. This skill states the implementation: hashing parameters, token derivation, cookie flags per environment, the identical-failure response contract, and lockout mechanics backed by `LoginAttempt`.

## When to use

- Changing anything under `src/lib/auth/`, `src/app/admin/login`, or `src/actions/auth/`, including session guards, cookies, or `middleware.ts`.
- Changing the `User`, `Session`, or `LoginAttempt` models, or any auth migration.
- Touching `AUTH_SECRET`, `SESSION_MAX_AGE_SECONDS`, `RATE_LIMIT_LOGIN_*`, or adding a credential-issuing flow such as a password reset.

## Relevant files

| Path | Responsibility |
| --- | --- |
| `src/lib/auth/password.ts` | `hashPassword`, `verifyPassword`. Nothing else. |
| `src/lib/auth/session-token.ts` | Pure token mint/hash, cookie shape, and lifetime maths. No database or request access. |
| `src/lib/auth/session.ts` | `Session` lifecycle, cookie read, write, and clear. |
| `src/lib/auth/guards.ts` | `getSession`, `requireAdmin`, `requireCapability`. |
| `src/lib/auth/permissions.ts` | Role to capability lookup. See the admin-dashboard skill. |
| `src/lib/rate-limit/throttle.ts` | Pure throttle decision. No database access. |
| `src/lib/rate-limit/login.ts` | IP and identifier limits, lockout, `LoginAttempt` writes. |
| `src/lib/auth/login-messages.ts` | The shared failure contract: codes, messages, result type. |
| `src/lib/validation/auth.ts` | Zod schemas for login and password input. |
| `src/actions/auth/login.ts` | Throttle, verify, mint session. |
| `src/actions/auth/logout.ts` | Revoke server-side, then clear the cookie. |
| `src/lib/env.ts` | Zod-validated access to every secret used here. |
| `prisma/seed.ts` | Local-only admin; refuses to run in production. |

## Implementation rules

**Password hashing**

- Argon2id by default: `memoryCost` 19456, `timeCost` 2, `parallelism` 1, `outputLen` 32, with the binding's 16-byte random salt. Parameter changes are a decision, not a runtime tweak.
- Output is self-describing (`argon2id$m=...$t=...$p=...`) so parameters can be raised without invalidating existing hashes, and `verifyPassword` reads parameters from the stored hash rather than from a constant.
- bcrypt cost 12 or higher is acceptable only where Argon2id is unavailable. Pick one, never both, never branch per call site.
- On a successful verify, if stored parameters are below current policy, re-hash and persist in the same request. Trim whitespace only: no case folding, no truncation.

**Session token**

- Token = `crypto.randomBytes(32).toString("base64url")`. Never a UUID, never a signed payload with claims; claims live in the row, not the token, so a role change cannot be replayed around.
- Store `tokenHash` = `HMAC-SHA256(key = AUTH_SECRET, message = rawToken)` as lowercase hex, with a unique index. The raw token exists only in the cookie and in request memory, and lookup is an indexed equality match, never a fetch-and-compare loop.
- Rotating `AUTH_SECRET` revokes every session by design. Document that; no fallback key ring.

**Expiry, sliding renewal, absolute ceiling**

- The sliding window is `SESSION_MAX_AGE_SECONDS`. The absolute ceiling is `2 * SESSION_MAX_AGE_SECONDS` measured from `createdAt`, derived in code rather than stored as a column.
- On each verified session: `nextExpiry = min(now + window, createdAt + ceiling)`. If that is not after `now` the session is dead and is revoked. Renewal never resurrects an expired session.
- Renew only when the remaining lifetime is under half the window, so `expiresAt` is not a hot write on every page view.

**Login flow, order fixed**

1. Parse with `src/lib/validation/auth.ts` and reject before any database work. Normalize the identifier: trim, lowercase.
2. Check the IP limit, then the identifier limit, then lockout. Identical failure on hit.
3. Verify the password. For an unknown user, verify against a precomputed dummy hash so the timing profile matches a real attempt.
4. Success: mint a token, insert the row, set the cookie, record `LoginAttempt` with `succeeded: true`, redirect. Signing in issues a fresh session and leaves other devices signed in: a login is not a global sign-out. Only a password change, role change, or deactivation revokes other sessions.
5. Failure: record `LoginAttempt` with `succeeded: false`, the identifier, and the IP.

**Identical-failure response contract**

| Condition | Action result | User message |
| --- | --- | --- |
| Unknown email | `code: "invalid_credentials"` | `Invalid email or password.` |
| Wrong password | `code: "invalid_credentials"` | `Invalid email or password.` |
| `isActive: false` | `code: "invalid_credentials"` | `Invalid email or password.` |
| Locked out | `code: "invalid_credentials"` | `Invalid email or password.` |
| Rate limited | `code: "rate_limited"` | `Too many attempts. Try again later.` |

- One message, one code, one status across every credential-level failure. No field-level differences, no "no account found" affordance, no different redirect, never the identifier echoed back, and never a redirect into `/admin`.
- `rate_limited` may be distinguished because it reveals nothing about the account. Collapse it into `invalid_credentials` if unsure.

**Rate limiting and lockout, backed by `LoginAttempt`**

- Two independent buckets, both checked: per IP and per normalized identifier, using `RATE_LIMIT_LOGIN_ATTEMPTS` within `RATE_LIMIT_LOGIN_WINDOW_SECONDS`.
- After the threshold of consecutive failures for one identifier, delay `2^(failures - threshold)` seconds, capped at `RATE_LIMIT_LOGIN_WINDOW_SECONDS`.
- Count consecutive failures from `LoginAttempt` rows where `succeeded: false` for that identifier since its last success. The table is the source of truth, so restarts and multiple instances behave identically. No in-memory counters.
- A success inserts its row and clears the window; history is never deleted. Successes still obey a hard IP ceiling, so one credential cannot be brute-forced from a single host.
- Prune rows older than the retention window on a schedule; retention must exceed the longest lockout window.

**Revocation**

- Logout sets `revokedAt` on that session, then clears the cookie. Cookie-clear alone is not logout, and revocation is by session id, never all sessions: one device must not kill the others.
- A password change revokes every other session, then mints a fresh session for the current request so the actor stays signed in.
- A `role` change or `isActive: false` revokes every session for that user, and deactivation must also block new logins.

**Cookie construction**

| Flag | Development | Production |
| --- | --- | --- |
| `httpOnly` | `true` | `true` |
| `sameSite` | `"lax"` | `"lax"` |
| `secure` | `false` | `true`, mandatory |
| `path` | `"/"` | `"/"` |
| `domain` | unset | unset, host-only |
| `maxAge` and `expires` | `SESSION_MAX_AGE_SECONDS`, both set | same |
| `priority` | unset | `"high"` |
| `name` | `ee_session` | `ee_session` |

- `secure` derives from `NODE_ENV === "production"`, not from a variable that can be set wrongly. No code path may disable it in production, and cookies are set in Server Actions or Route Handlers, never from a Client Component.

**Seed admin, local only**

- `prisma/seed.ts` refuses when `NODE_ENV === "production"` and when `SEED_ADMIN_EMAIL` or `SEED_ADMIN_PASSWORD` is empty, naming the missing variable rather than skipping silently.
- Passwords are hashed through `src/lib/auth/password.ts`, never inserted as plaintext or a precomputed hash. Seed is idempotent on `email`, and the `.env.example` default email is a local placeholder that is never valid in production.

## Security requirements

- Never log passwords, hashes, raw tokens, `tokenHash`, or cookies. The logger takes a user id, never a credential.
- Verify against a dummy hash for unknown users, or response timing enumerates accounts. The contract table above is enforced by a unit test, not by reviewer memory.
- Never accept a role, `userId`, or `isActive` from a login form. Role comes from the session join on the server.
- `HttpOnly`, `SameSite=Lax`, `Secure` in production. `SameSite=None` needs an inline justification and `Secure: true`, never as a fix for "something did not work".
- Keep Server Action origin checks enabled: no wildcard `allowedOrigins`, and no mutation moved into a `GET` handler to evade them. Every state-changing Route Handler validates `Origin` against `NEXT_PUBLIC_APP_URL`, and a missing header on a browser mutation is rejected.
- Revocation is a database write on logout, password change, deactivation, and role change, proven by test.

## Testing requirements

Unit (Vitest):

- Hash round trip; wrong password and a tampered hash both rejected; legacy parameters trigger upgrade and rehash.
- `mintToken` returns base64url from 32 bytes; `hashToken` is deterministic, key-dependent, and never equals the token. Cookie options match the table for development and production.
- Absolute ceiling holds and renewal never resurrects an expired session, with fake timers.
- Every row of the contract table yields the same message and code; `Origin` validation accepts only `NEXT_PUBLIC_APP_URL`; rate-limit threshold, delay, and cap are correct.

Integration (real PostgreSQL):

- Valid credentials create exactly one `Session`; invalid create none. The cookie value appears nowhere in the database in raw form.
- One `LoginAttempt` row per attempt with identifier and IP; the threshold-th consecutive failure locks out, a success resets the window, and the delay expires.
- Replaying the cookie after logout fails, as does an old token after login rotation.
- Password change revokes other sessions but keeps the current one valid; role change and deactivation revoke all, and an inactive user cannot log in.
- Seed refuses under `NODE_ENV=production` and with empty seed credentials.

E2E (Playwright):

- Login lands on `/admin`; logout returns to `/admin/login` and the old cookie is rejected.
- Unknown email and wrong password render the same message in the DOM.

## Common mistakes

- Storing the raw token, or a bare `sha256` with no key, and calling it hashed. Putting claims in the token so it replays after a role change.
- Renewing `expiresAt` on every request, turning each page view into a write.
- Clearing the cookie on logout and leaving the row valid, or revoking all sessions on one logout.
- Returning "no user with that email", or a distinct inactive-account message.
- Skipping the dummy-hash verify, reintroducing timing enumeration.
- Counting failures in process memory so a restart resets the lockout, or deleting `LoginAttempt` history after a success.
- `secure: false` hardcoded, or `secure` driven by a custom variable instead of `NODE_ENV`. `sameSite: "none"` used to make logout or a form work.
- Accepting `role` from the login payload.
- Plaintext or externally precomputed hashes in `prisma/seed.ts`, or low bcrypt cost "because it is only dev" with the same path shipping.
- `crypto.randomUUID()` as the session token: 122 bits is not 256.

## Completion checklist

- [ ] Argon2id at policy parameters, self-describing, with upgrade-on-verify.
- [ ] Token is 32 random bytes; only a keyed HMAC hash stored; unique index present.
- [ ] Sliding window and absolute ceiling implemented, with no resurrection.
- [ ] Login order is validate, throttle, verify-with-dummy, mint, record.
- [ ] Every failure path returns the identical message and code, proven by test.
- [ ] Rate limits on IP and identifier, backed by `LoginAttempt`, with delay and cap.
- [ ] Logout, password change, role change, and deactivation all revoke server-side.
- [ ] Cookie flags match the table; `Secure` forced in production.
- [ ] Server Action origin checks intact; handlers validate `Origin`.
- [ ] No password, hash, token, `tokenHash`, or cookie in any log line.
- [ ] Seed refuses in production and with empty seed credentials.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.