# Deployment Procedure - Eagles Eye

This document outlines the production deployment procedure for Eagles Eye. **Do not deploy automatically.** All steps must be performed and verified manually.

## Prerequisites

- Access to production PostgreSQL instance
- Access to production S3-compatible object storage (private bucket)
- Access to production hosting platform (capable of running Next.js with Node.js runtime)
- All production secrets generated and stored securely (never in repo)
- Staging deployment verified and smoke tested

---

## Pre-Deployment Checklist

- [ ] All changes committed and reviewed
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes (470/470)
- [ ] `npm run build` succeeds
- [ ] Staging environment tested end-to-end
- [ ] Database backup taken (see BACKUP-RESTORE.md)
- [ ] Production environment variables configured (see `.env.production.example`)
- [ ] S3 bucket created, private, with appropriate CORS if needed
- [ ] SSL/TLS certificate configured for domain

---

## Deployment Steps

### 1. Prepare Environment

1. Verify production PostgreSQL is accessible from deployment host
2. Verify S3 bucket exists and credentials work
3. Configure all env vars per `.env.production.example` in production platform (secret store)

**Required env vars:**
- `DATABASE_URL` (with SSL required)
- `AUTH_SECRET` (≥32 chars, generated securely)
- `SESSION_MAX_AGE_SECONDS` (default 604800)
- `NEXT_PUBLIC_APP_URL` (canonical https:// URL)
- `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_FORCE_PATH_STYLE`
- `RATE_LIMIT_*` as configured
- `UPLOAD_MAX_BYTES` (default 5242880)
- `NODE_ENV=production`

**Do NOT set:** `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `STORAGE_LOCAL_DIR`

`ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `DATABASE_URL` are needed once by
the administrator bootstrap in step 7. Keep the secrets in your secret store,
but note that after the account exists `ADMIN_EMAIL` and `ADMIN_PASSWORD` are no
longer read at boot: they are not runtime configuration.

### 2. Take Pre-Migration Backup

```bash
# From a secure host with DB access
pg_dump --format=custom --no-owner --no-privileges \
  "postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require" \
  > eagles-eye-predeploy-$(date +%Y%m%d-%H%M%S).dump
```

Verify backup file exists and has non-zero size.

### 3. Run Migrations

On the deployment environment or CI runner with production DB access:

```bash
# Install dependencies (use lockfile)
npm ci

# Run migrations - NEVER use prisma migrate dev in production
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```

Migrations must show "Up to date". If any pending/failing, abort and investigate.

### 4. Build Application

```bash
# Generate Prisma client
npx prisma generate

# Build production bundle
npm run build
```

Build must succeed with no errors/warnings. Verify `next start` works in pre-prod check if desired.

### 5. Deploy Artifact

Deploy the built `.next` directory, `public/`, `package.json`, `node_modules` (or use standalone output) to production host. Use the artifact from this build (promote tested artifact, don't rebuild per env).

### 6. Start Application

Start with production runtime:
```bash
NODE_ENV=production npm run start
# or use process manager (PM2, systemd, etc.)
```

### 7. Create the First Administrator

The seed refuses to run in production, so a deployed environment gains its
first administrator with `npm run admin:create`. Run it from a checkout with
full dev dependencies (`npm ci`), before pruning `--omit=dev`: it is a
one-shot script, not a runtime dependency.

```bash
# Credentials come from the environment, never the command line.
ADMIN_EMAIL="admin@example.com" \
ADMIN_PASSWORD="$(openssl rand -base64 24)" \
ADMIN_NAME="Site Admin" \
npm run admin:create -- --confirm=admin@example.com
```

- `--confirm=<email>` must exactly match `ADMIN_EMAIL`. It forces you to state
  which account you mean; a stale variable cannot create an account by accident.
- If the account already exists the script refuses. Re-run with `--update` to
  replace the password and revoke every session for that account.
- The password is never echoed; it is hashed with the same Argon2id policy the
  app uses. Store it in your secret manager and share it with the operator out
  of band.
- Once the account is verified, remove `ADMIN_EMAIL`/`ADMIN_PASSWORD` from the
  deploy host if they must persist there at all. The application never reads
  them.

### 8. Smoke Tests

Verify critical functionality immediately after deploy:

- [ ] Homepage loads (`GET /`, returns 200)
- [ ] Stories catalogue (`GET /stories`, only published stories shown)
- [ ] Search works (`GET /search?q=test`)
- [ ] Categories load (`GET /categories`)
- [ ] Sample story detail (published) loads correctly
- [ ] Sample chapter reader (published) loads correctly; navigation works
- [ ] Admin login page loads (`GET /admin/login`)
- [ ] Admin dashboard requires auth (redirects to login if unauthenticated)
- [ ] Admin login succeeds and the dashboard renders with the step-7 account
- [ ] Sitemap generates (`GET /sitemap.xml`, contains only published URLs, valid XML)
- [ ] Robots.txt (`GET /robots.txt`, disallows /admin, /api)
- [ ] Security headers present (check CSP, HSTS, X-Frame-Options)
- [ ] Image serving works for published story covers
- [ ] Unpublished story URLs return 404 (not found) to anonymous users
- [ ] Draft chapters return 404 to anonymous users

### 9. Post-Deployment Verification

- [ ] Check application logs for errors
- [ ] Verify database connections healthy
- [ ] Test admin login with real admin account
- [ ] Verify rate limiting not blocking legitimate traffic
- [ ] Confirm `NEXT_PUBLIC_APP_URL` matches domain (canonical URLs correct)

---

## Important Notes

- **Never run `prisma migrate dev` in production.** Always use `prisma migrate deploy`.
- **Never seed in production.** `prisma/seed.ts` refuses when `NODE_ENV=production`.
- **Admin bootstrap is `npm run admin:create`.** Env-only credentials, explicit
  `--confirm=<email>`, Argon2id hashing, and `--update` to rotate an existing
  account's password (revoking its sessions). Never pass the password on the
  command line.
- **Promote artifacts, not source.** Rebuilding with different env vars inlines `NEXT_PUBLIC_*` differently.
- **Back up before every migration.** Even additive migrations can have issues.
- **Monitor logs** for the first 30 minutes after deploy.
- **Admin access** requires valid `AUTH_SECRET` and DB sessions. Rotate `AUTH_SECRET` only if compromised (invalidates all sessions).
