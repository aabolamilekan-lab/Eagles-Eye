# Skill: Deployment

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md sections 12, 17, and 18 govern environments and the release gate. This skill covers the operational detail they leave to the skill: environment separation, the full environment variable contract, migration execution on deploy, build pipeline order, seed behaviour, rendering and caching strategy, health checks, observability with request id correlation, backup and restore, and the pre-release security checklist.

## When to use

- Setting up or changing any environment: local, CI, staging, production.
- Editing `.env.example`, `src/lib/env.ts`, or any environment variable name, and adding a CI workflow, Dockerfile, or release script.
- Adding a migration that will run against a live database, deciding rendering mode, adding a `revalidate` value or cache tag, or adding health checks, logging, alerting, backups, or a release.

## Relevant files

| Path | Responsibility |
| --- | --- |
| `.env.example` | Committed env contract. Names and shapes only. |
| `.env.production.example` | Placeholder-where to copy for a production environment. Never real values. |
| `src/lib/env.ts` | Zod validation at startup; fails fast with a clear message. |
| `src/lib/logger.ts` | Request id correlation, redaction, levels. No `console.log`. |
| `src/lib/queries/public/{stories,categories,tags}.ts` | Public cache tags declared once and read by every cached public query. |
| `src/lib/stories/revalidate.ts` | `updateTag` revalidation entry used by admin mutations. |
| `prisma/migrations/` | Committed SQL migrations, shipped with dependent code. |
| `prisma/seed.ts` | Local-only seed; refuses to run in production. |
| `scripts/create-admin.ts` | `npm run admin:create`; production first-administrator bootstrap. Env-only credentials. |

Not yet implemented (do not document them as live): `/api/health` health
endpoint, `middleware.ts`, a CI workflow under `.github/workflows/`, and
`scripts/verify-env.ts`. Treat any instruction below that assumes they exist as
the contract to build against, not current behaviour.

## Implementation rules

**Environment separation**

| | Local | CI | Staging | Production |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `test`, then `production` to build | `production` | `production` |
| Database | Local PostgreSQL | Ephemeral service container | Managed staging instance | Managed production instance |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `http://localhost:3000` | Staging hostname | Canonical production origin |
| Cookies | `Secure` off | `Secure` off in tests | `Secure` on | `Secure` on |
| Seed | Manual, `npm run db:seed` | Test fixtures in setup | Manual, on request | Never |

- Every environment has its own database, `AUTH_SECRET`, and bucket. A shared staging resource is a defect, not a shortcut. `AUTH_SECRET` is ephemeral per CI run and real per deployed environment.
- `NEXT_PUBLIC_*` is inlined at build time, so changing it needs a rebuild, not a restart. Production secrets come from the platform secret store: never the repository, never a build argument that lands in image history, never a checked-in file.
- Promote the built artifact plus configuration; do not rebuild per environment, or what was tested is not what ships. `src/lib/env.ts` throws naming the variable, never its value, and never defaults a secret.

**Environment variable contract**

| Variable | Public | Required in | Format and purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | No | All | PostgreSQL connection string. Server-only. |
| `AUTH_SECRET` | No | All | Session and HMAC key, 32+ bytes. Rotating revokes all sessions. |
| `SESSION_MAX_AGE_SECONDS` | No | All | Sliding session window in seconds. Integer. |
| `NEXT_PUBLIC_APP_URL` | Yes | All | Canonical origin for metadata, sitemap, `Origin` checks. |
| `STORAGE_ENDPOINT` | No | Where covers are used | S3-compatible endpoint. Server-only. |
| `STORAGE_REGION` | No | Same | Bucket region. Server-only. |
| `STORAGE_BUCKET` | No | Same | Private bucket name. Server-only. |
| `STORAGE_ACCESS_KEY_ID` | No | Same | Storage credential. Server-only. |
| `STORAGE_SECRET_ACCESS_KEY` | No | Same | Storage credential. Server-only. |
| `STORAGE_FORCE_PATH_STYLE` | No | MinIO and similar | `true` for path-style addressing. Server-only. |
| `RATE_LIMIT_LOGIN_ATTEMPTS` | No | All | Failures per window before lockout. Integer. |
| `RATE_LIMIT_LOGIN_WINDOW_SECONDS` | No | All | Login rate-limit and lockout window. Integer. |
| `RATE_LIMIT_WRITE_ACTIONS` | No | All | Admin mutations per window per session. Integer. |
| `RATE_LIMIT_WRITE_WINDOW_SECONDS` | No | All | Admin write-limit window. Integer. |
| `UPLOAD_MAX_BYTES` | No | Where covers are used | Server-enforced cover size ceiling in bytes. |
| `SEED_ADMIN_EMAIL` | No | Local only | Seed admin email. Absent in production. |
| `SEED_ADMIN_PASSWORD` | No | Local only | Seed admin password. Absent in production. |
| `ADMIN_EMAIL` | No | Bootstrap only | One-shot target for `npm run admin:create`. Not read at boot. |
| `ADMIN_NAME` | No | Bootstrap only | Optional display name for the bootstrap account. |
| `ADMIN_PASSWORD` | No | Bootstrap only | One-shot password for the bootstrap account, never on the command line. |

- Adding a variable means updating `.env.example` and `src/lib/env.ts` together, documenting purpose, format, and public status. No server-only variable is imported into a Client Component; that is a build error to fix.

**Migration execution on deploy**

- Deploy runs `npx prisma migrate deploy`. Never `prisma migrate dev` in CI or production: it creates migrations and can reset data. Migrations are committed under `prisma/migrations/` and ship with the code that needs them; a deploy never generates one.
- Order: `npx prisma migrate status` (no pending or failed) → `npx prisma migrate deploy` → `npx prisma generate`. Take a verified backup immediately before migrating, even for additive changes, and keep `prisma/migrations/migration_lock.toml`.
- Prefer expand and contract: add nullable columns or new tables, ship code that tolerates both shapes, then drop the old column in a later release. Locking index creation uses the PostgreSQL concurrent form in the migration SQL.
- Never edit an applied migration: correct forward, or use `npx prisma migrate resolve` with a written justification, and review SQL with `npx prisma migrate diff` before staging.

**Build pipeline order and seed behaviour**

1. `npm ci` from the committed lockfile. Never `npm install` in CI.
2. `npm run lint`
3. `npm run typecheck`
4. `npx prisma migrate deploy` against the CI database
5. `npx prisma generate`
6. `npm test`, Vitest and Playwright, against that migrated database
7. `npx prisma migrate status`, clean after the run
8. `npm run build`
9. `npm audit --audit-level=high` plus dependency review
10. Publish the artifact, then smoke test the deployed environment

- All four gate commands run on the commit that ships; a green branch that was rebuilt is not evidence. The build needs `DATABASE_URL`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL`, because env validation runs at build time, supplied from the CI secret store. Install Playwright browsers explicitly in the CI image, cache `node_modules` and the browser directory by lockfile hash, never cache `.next` across commits, and run `next start`, not `next dev`, never as root.
- `prisma/seed.ts` is wired to `npm run db:seed`, manual everywhere except local development, and never a build, release, or migrate step. It refuses when `NODE_ENV === "production"` and when either seed variable is empty, naming the missing variable. Staging seeding is explicit, reversible, uses staging-only credentials, and hashes through `src/lib/auth/password.ts`.
- The first administrator in a deployed environment is created by `npm run admin:create` (`scripts/create-admin.ts`), never the seed. Credentials come from `ADMIN_EMAIL`/`ADMIN_PASSWORD` in the environment, the target email is repeated as `--confirm=<email>`, and the password is hashed with the application's Argon2id policy and never echoed. An existing account is never touched without `--update`, which replaces the password and revokes that account's sessions. Run it from a checkout with dev dependencies (`npm ci`), not from an `--omit=dev` runtime image, because it executes under `tsx`. These variables are bootstrap-only: the application never reads them at boot, so they can be cleared after the account is verified.

**Rendering and caching**

| Route | Mode | Notes |
| --- | --- | --- |
| `/` and `/stories` | Cached, revalidated | Revalidated by story publish tags, per page. |
| `/stories/[slug]` and `/stories/[slug]/chapter/[chapterSlug]` | Cached, revalidated | Revalidated by `story:<slug>` and chapter tags. |
| `/categories/[slug]` | Cached, revalidated | `category:<slug>` and list tags. |
| `/search` | Dynamic | Depends on the query string. |
| `/sitemap.ts`, `/robots.ts` | Regenerated | Published URLs only, never admin. |
| `/admin/login` | Dynamic | Never cached. |
| `/admin/**` | Dynamic, `force-dynamic` | Per-session. Never cached or shared. |
| Cover image route (`/api/images/...`) | Dynamic, `no-store` | Never cached; reads private storage. |

- Public reads use the shared query layer with `unstable_cache` or `revalidate` and named tags declared once in `src/lib/cache/tags.ts`, and every admin publish, unpublish, update, or delete revalidates the affected story, its category, the list pages, and the sitemap. `dynamic`, `revalidate`, and `fetchCache` appear only beside a deliberate reason, and the cause of unexpected dynamism is fixed rather than papered over with revalidate values.

**Health checks and observability**

- There is no `/api/health` handler yet. When one is added it must run a cheap `SELECT 1` with a short timeout and return `{ "status": "ok" }` or `{ "status": "unavailable" }`, with `Cache-Control: no-store` and no version, hostname, DSN, bucket name, or error text in the body. A failed probe logs detail with a request id and returns a generic 503. A future `middleware.ts` matcher must exclude it so probes do not depend on session handling, and the probe stays fast and dependency-light: deep dependency checks belong in monitoring, and alerts fire on sustained failure, not a single miss.
- Every request gets an id: reuse an inbound `x-request-id`, otherwise generate. Propagate it on the response and include it in every log line and error boundary report.
- Log method, route template rather than raw path with ids, status, duration, user id when authenticated, and the request id, plus an error code on failure. Never log passwords, hashes, raw tokens, `tokenHash`, cookies, `Authorization`, `DATABASE_URL`, `AUTH_SECRET`, storage keys, or full bodies; redact in the logger, not at the call site.
- Levels: `error` for unexpected failures with stack, `warn` for denied authorization and rejected origins, `info` for login, logout, publish, delete. Denials log user id, capability, and route; that signal separates an attack from a bug. Rate-limit hits, lockouts, failed logins, and CSRF rejections are logged and aggregated. No `console.log`, `console.debug`, or `debugger`.

**Backup and restore**

- PostgreSQL: scheduled `pg_dump -Fc` to off-site storage, daily at minimum, plus a dump immediately before any migration, with retention enforced by the scheduler. Backups are encrypted, access-controlled separately, and never written to the database host.
- A backup is real only once restored. Drill on a schedule: restore into a scratch database, run `npx prisma migrate status`, start the app against it, confirm stories and chapters load, and record the date and result. Object storage keeps versioning on plus off-site replication or sync; covers are re-uploadable, database rows are not, and RPO and RTO are documented along with the rebuild procedure for covers from `coverImage`.
- Restore order is database first, then storage. Backup credentials are read-only and scoped to dumps, not the application credentials.

**Pre-release security checklist**

- `npm audit --audit-level=high` passes. Any high or critical finding is fixed, or reported in writing with the reason and the compensating control. `npm outdated` is reviewed, no new major version ships in the same release as a behavioural change, and dependency review confirms each added package has one purpose, is maintained, and duplicates nothing already in the stack. The lockfile is committed and CI installs with `npm ci`.
- Every `NEXT_PUBLIC_*` value reviewed and confirmed public; no new client-side secret. `.env` untracked and confirmed absent from the commit and the image, `git status` clean, and any exposed secret rotated including storage credentials and `AUTH_SECRET`.
- Session cookies `Secure` in production, `HttpOnly`, `SameSite=Lax`; login lockout proven in staging; `Origin` validation active on state-changing handlers and Server Action origin checks untouched.
- Upload allowlist, size ceiling, and magic-byte check verified against a renamed non-image.
- `robots.txt` disallows `/admin`, the sitemap holds published URLs only with no draft or archived URL, and `npx prisma migrate status` is clean before and after the release run with migrations reviewed as SQL and no dropped or renamed column alongside the code that stops using it.
- No `.only`, `console.log`, ownerless TODO, or commented-out block in the diff. The four-command gate passed on the exact release commit and the artifact was smoke tested after deploy, with the rollback path identified in advance: previous artifact, and whether the migration is backward compatible with it.

## Security requirements

- No secret in source, build arguments, image layers, tests, fixtures, or committed files. Production secrets come from the platform secret store only.
- `NEXT_PUBLIC_*` is public by definition. Any server-only value carrying that prefix is a defect to fix before release.
- Env validation fails at startup naming the variable and never its value, and secrets are never defaulted to a weak placeholder.
- Session cookies are `Secure` in production with `HttpOnly` and `SameSite=Lax`; rate limits are configured with real values rather than left unset, and the login lockout is proven in staging.
- `Origin` validation stays active on state-changing Route Handlers and Server Action origin checks stay untouched. No wildcard `allowedOrigins`, no `SameSite=None` without justification.
- Uploads are validated by allowlist, server-side size ceiling, and magic-byte check, and object storage stays private with server-only credentials.
- Logs and the health endpoint leak nothing: no tokens, cookies, bodies, DSNs, bucket names, or error text.
- Deploy steps never run `migrate dev` or the seed against production, and no migration is destructive in the same release as the code that stops using the column.

## Testing requirements

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass on the release commit in CI, not only on a developer machine.
- Env validation: a missing or malformed variable fails at startup naming the variable and never its value. Migration tests: apply the full history to an empty database, then re-run to confirm the deploy path is repeatable.
- Health check (once `/api/health` exists): 200 `{ "status": "ok" }` when the database is reachable, 503 with a generic body when not, `no-store` in both cases, no internal detail.
- Caching: publishing makes a story publicly visible without a rebuild, and unpublishing removes it, including from the sitemap. Backup drill performed and recorded before the release is called reliable. Log redaction: a login attempt and a rejected authorization produce lines with no password, token, cookie, or secret value.

## Common mistakes

- `prisma migrate dev` in CI or production, generating a migration during a deploy, or editing an already-applied migration.
- A destructive migration in the same release as the code that stops using the column, or deploying without a fresh verified backup.
- Production secrets as build arguments, persisting in image history, a real `.env` in the image or commit, or a database, bucket, or `AUTH_SECRET` shared between staging and production.
- Rebuilding per environment, `npm install` in CI instead of `npm ci`, or treating `next build` success as the whole gate.
- Running the seed in the release, or shipping seed credentials to production.
- Caching an admin route or (once it exists) the health check, forgetting to revalidate on publish or unpublish, logging tokens or cookies or bodies or raw paths with record ids, and returning database or storage errors from the health endpoint.
- Treating a backup as existing until a restore has been verified, restoring storage before the database, or shipping `npm audit` findings as "known" without a written reason.

## Completion checklist

- [ ] Environment separation holds: distinct database, bucket, and `AUTH_SECRET` per environment.
- [ ] `.env.example` and `src/lib/env.ts` updated together, public status documented per variable.
- [ ] Validation fails fast, naming the variable and never its value.
- [ ] Deploy runs `prisma migrate deploy`, never `migrate dev`; migrations committed, reviewed, and backward compatible.
- [ ] Backup taken and verified before migrating, and the four-command gate, `migrate deploy`, and `npm audit` pass on the release commit.
- [ ] Seed never runs in production and has no production credentials.
- [ ] Rendering mode decided per route, cache tags revalidated on every public-facing change, and once the health endpoint exists it is minimal, `no-store`, dependency-light, and excluded from any middleware matcher.
- [ ] Request id on every log line, response, and error report; redaction enforced in the logger.
- [ ] Backups scheduled, off-site, encrypted, with a recorded restore drill.
- [ ] Pre-release security checklist completed, accepted findings written down, rollback path identified.