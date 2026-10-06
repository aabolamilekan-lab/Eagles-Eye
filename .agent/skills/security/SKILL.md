# Skill: Security

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md sections 4, 7, 8, 10, 11, 12, and 15 state the requirements. This skill maps each threat class in this stack to its concrete control: which module enforces it, what fails closed, and what a reviewer must verify before approving a change.

## When to use

- Adding or changing any Server Action or Route Handler.
- Touching `src/lib/sanitize/`, `src/lib/storage/`, `src/lib/auth/`, `src/lib/rate-limit/`, or `src/lib/env.ts`.
- Any new input field reaching Zod, Prisma, the filesystem, object storage, or a `redirect`.
- Rendering stored HTML, adding a `dangerouslySetInnerHTML`, or accepting an image upload.
- Changing `next.config.*`, `.env.example`, dependency versions, or error handling and logging.
- Adding an admin route, an API endpoint, or a redirect that takes external input.

## Relevant files

| Path | Responsibility |
| --- | --- |
| `src/lib/env.ts` | Zod-validated env. Parses once at startup and fails fast. |
| `src/lib/sanitize/html.ts` | Allowlist sanitizer. The only writer of `Chapter.content`. |
| `src/components/public/RichContent.tsx` | The single sanctioned `dangerouslySetInnerHTML` site. |
| `src/lib/storage/images.ts` | MIME allowlist, magic bytes, sharp re-encode, UUID keys, orphan cleanup. |
| `src/lib/auth/guards.ts` | Authentication and authorization gates. |
| `src/lib/auth/permissions.ts` | Capability lookup keyed by role. Default deny. |
| `src/lib/rate-limit/login.ts` | IP and identifier limits, lockout, `LoginAttempt` writes. |
| `src/lib/errors.ts` | Domain error types and safe client mapping. |
| `src/lib/logger.ts` | Structured logging with request-id correlation and redaction. |
| `src/lib/validation/*.ts` | One Zod module per input surface. |
| `src/actions/**` | Mutations. Each re-checks authz at call time. |
| `src/app/**/error.tsx`, `global-error.tsx` | Route-segment error boundaries. |
| `next.config.ts` | Security headers. No server env exposed. |
| `.env.example` | The documented, value-free env contract. |

## Implementation rules

**Threat to control map**

| Threat | Control in this stack |
| --- | --- |
| XSS / unsafe HTML | Server allowlist sanitize on write in `src/lib/sanitize/html.ts`; render only via `RichContent.tsx` |
| SQL injection | Prisma parameterization; `$queryRaw` tagged templates only; no `$queryRawUnsafe` |
| CSRF | Next.js Server Action origin checks left intact; `Origin` validation or token on state-changing Route Handlers; `SameSite=Lax` |
| IDOR | Every admin read and mutation re-checks authorization in the action, scoped by id and status transition |
| Privilege escalation | Role loaded from the database via the session; never from form, query, or client state; permission lookup defaults to deny |
| Brute force | IP and identifier rate limits, exponential delay, lockout, `LoginAttempt` audit, identical failure response |
| Session attacks | 32 random bytes; `tokenHash` = HMAC-SHA256 keyed by `AUTH_SECRET`; rotation on login; server-side revoke on logout; absolute expiry plus sliding renewal |
| Malicious uploads | MIME allowlist, extension match, 5 MB ceiling from `UPLOAD_MAX_BYTES`, magic-byte check, sharp re-encode, UUID keys |
| Open redirect | Redirect targets resolved against a known-path allowlist or a relative path only; never a raw `?next=` |
| Information leakage | Safe error mapping, redacting logger, no stack traces or Prisma text in responses |
| Insecure APIs | Every Route Handler authenticates, authorizes, validates, and rate-limits, and returns a typed status |
| Unsafe Server Actions | `'use server'` modules re-check authz and parse input; never trust the caller |
| Dependency vulns | `npm audit` before finishing any phase that adds dependencies |
| Client-side authorization | Never. Hidden UI is not access control |

**Sanitization**

- Sanitize in `src/lib/sanitize/html.ts` with an allowlist of tags and attributes. Never a denylist, never a regex pass.
- Sanitize on write, on the server, even for an admin-authored chapter. The Tiptap editor is a UX affordance, not a control.
- Reject or strip `script`, `iframe`, `object`, `embed`, `form`, `style`, `link`, `meta`, `svg`, `srcdoc`, comments, and doctype nodes; `on*` handlers; `javascript:`, `vbscript:`, and `data:` URLs; CSS `expression()`, `behavior:`, `-moz-binding:`, and `position: fixed`.
- Force `rel="noopener noreferrer"` on links with a target, and restrict targets.
- Generate the plain-text short description server-side from the sanitized output, not from the raw input.
- `dangerouslySetInnerHTML` appears in exactly one component. A second occurrence is a review blocker.

**Uploads**

- Validate everything before any object is written: declared MIME in `image/jpeg`, `image/png`, `image/webp`; extension consistent with that MIME; size at or under `UPLOAD_MAX_BYTES` (5 MB); magic bytes matching the declared type; `sharp` metadata yielding plausible width and height; re-encode through sharp to strip payloads.
- Object name is `crypto.randomUUID()` plus a normalized extension. The client filename, path, and extension are never trusted and never reused.
- Keys live in a private bucket outside `public/`. Serving happens through the image route or CDN.
- Replace a cover inside the transaction that updates `coverImage`; if the write fails, delete the new object. Delete orphaned objects when a cover is replaced or a story is deleted.
- Provider errors are mapped to a generic message. Bucket names and keys never surface.

**Env and build configuration**

- `src/lib/env.ts` validates every variable with Zod at startup and throws a named error listing the missing keys. Secrets have no default value; a missing or weak `AUTH_SECRET` is a hard startup failure, not a fallback.
- `STORAGE_*`, `AUTH_SECRET`, `DATABASE_URL`, and `RATE_LIMIT_*` are server-only. A `NEXT_PUBLIC_` prefix is a publish decision, never a convenience.
- Importing a private variable into a Client Component is a build error to fix, never to work around with a dynamic import or a prop named `secret`.
- `next.config.ts` exposes no server environment value to the client: no `env` block copying secrets, no custom headers that echo them, and no `publicRuntimeConfig`/`serverRuntimeConfig` split that smuggles a secret into the client bundle.
- `.env` is never committed, never copied into a fixture or a test, and never read by a Playwright trace or a screenshot.

**Redirects**

- Post-login and post-action redirects target a path from a fixed allowlist (`/admin`, `/admin/stories`, `/admin/chapters`) or a path resolved against `NEXT_PUBLIC_APP_URL`.
- A `next` parameter is rejected unless it is a single-slash-relative path with no scheme, no `//`, and no backslash. Protocol-relative and absolute URLs are refused.
- JSON and XML responses set `X-Content-Type-Options: nosniff`. Security headers include a strict `Content-Security-Policy` with no `unsafe-eval` in production, `frame-ancestors 'none'`, `Referrer-Policy`, and `X-Frame-Options: DENY`.

**Errors and logging**

- Map expected failures to `{ ok: false, error }` for forms and typed status codes for handlers. Unexpected failures become a generic message plus a server log.
- Never return a stack trace, SQL, a Prisma message, a bucket key, or an env value.
- Attach a request id to every log line and to the user-facing error so a report can be traced without exposing internals.
- `src/lib/logger.ts` redacts known-sensitive keys before serializing. No `console.log` in committed code, and no full request bodies.

**Rate limits**

- Login is limited by IP and by identifier using `RATE_LIMIT_LOGIN_ATTEMPTS` and `RATE_LIMIT_LOGIN_WINDOW_SECONDS`.
- State-changing writes are limited with `RATE_LIMIT_WRITE_ACTIONS` and `RATE_LIMIT_WRITE_WINDOW_SECONDS`.
- An unknown user is verified against a dummy hash so the timing profile matches a real attempt, and the failure text is byte-identical for unknown user, wrong password, inactive account, and lockout.

## Security requirements

- Default deny. A missing policy rejects the request.
- Re-verify authentication, role, permission, and resource scope inside every Server Action and Route Handler. The admin layout guard is a UX convenience, not the control.
- Validate all external input at the server boundary. Strip unknown keys before any Prisma call.
- Never accept a bare id for an admin mutation without a role check, and never accept a status field to bypass a transition helper.
- Rotate `AUTH_SECRET` immediately after any suspected exposure. Removing it from the latest commit is not remediation.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `path=/`, minimal scope. `SameSite=None` requires `Secure` and a written justification.
- Run `npm audit` before a phase that added dependencies and report any high or critical finding rather than deferring it.

## Testing requirements

- Unit: every sanitize payload in the table above, asserting the stripped output; redirect target validation; rate-limit accounting; permission lookup default-deny; env parsing failure cases.
- Integration: non-admin sessions calling each admin Server Action and Route Handler receive a rejection and change no row.
- Integration: XSS payloads stored through the chapter action come back inert from the database, and `javascript:` hrefs are neutralised.
- Integration: an IDOR attempt against another story's or chapter's id is rejected; a CSRF attempt with a foreign `Origin` is rejected; a revoked session token is rejected after logout; repeated login failures produce a lockout.
- Integration: an upload that is a renamed executable, an over-limit body, or a mismatched extension is rejected and leaves no stored object.
- E2E: a Playwright test that reads `/admin/stories/<id>` with a public, non-admin context and asserts a redirect, not content.
- No test asserts on an error body containing internal detail; assert the status and the safe message.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Trusting the Tiptap output because the editor sanitized it | Sanitize again server-side on write |
| Second `dangerouslySetInnerHTML` for a caption or short description | Render as text, or route through `RichContent.tsx` |
| Role read from a form field or hidden input | Load the role from the session's database row |
| Hiding a delete button instead of checking the action | Enforce in the action; hidden UI is not access control |
| `$queryRawUnsafe` with a user-supplied slug | Tagged template, or Prisma `findFirst` with a bound value |
| Redirecting to `next` straight from the query string | Allowlist the target or accept single-slash relative paths only |
| Logging the whole error object, including request data | Log a redacted, field-selected object through `src/lib/logger.ts` |
| Trusting the client-declared MIME type on upload | Magic bytes plus sharp re-encode |
| `AUTH_SECRET` defaulting to a placeholder so the app boots | Fail fast with a named startup error |
| Copying a secret into `next.config.ts` `env` to "share it" | Import it in server code only |
| Catching and re-showing `error.message` in a Server Component | Map to a safe message; log the detail with a request id |
| Assuming `SameSite=Lax` covers a state-changing Route Handler | Validate `Origin` or require a token |

## Completion checklist

- [ ] Every new input surface has a Zod schema in `src/lib/validation/` and is parsed server-side.
- [ ] Rich text is sanitized server-side on write, and `dangerouslySetInnerHTML` appears in exactly one component.
- [ ] Every admin action and handler re-checks authn, role, permission, and resource scope, defaulting to deny.
- [ ] Uploads enforce MIME allowlist, size ceiling, magic bytes, sharp re-encode, and UUID keys.
- [ ] Redirect targets are allowlisted or strictly relative.
- [ ] `src/lib/env.ts` fails fast with no weak defaults; `.env` is absent from the repo and from test fixtures.
- [ ] `next.config.ts` exposes no server env value to the client, and security headers are set.
- [ ] Errors are mapped to safe messages; logs are redacted and correlated by request id; no `console.log`.
- [ ] Rate limits configured for login and writes from the `RATE_LIMIT_*` variables.
- [ ] `npm audit` run and reported; `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.