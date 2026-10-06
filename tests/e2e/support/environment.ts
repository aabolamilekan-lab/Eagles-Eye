import fs from "node:fs";
import path from "node:path";

/**
 * E2E environment resolution.
 *
 * `npm run test:e2e` must work from a clean checkout with no manual setup: no
 * hand-created database, no hand-applied migration, no hand-seeded admin. Every
 * value below is derived from the developer's existing `.env` files or from a
 * documented local-only test default. Nothing here is a real credential, and
 * nothing here is ever logged.
 *
 * The suite talks to a dedicated database and a dedicated port so it can never
 * disturb a development database.
 */

/** Project root, located by walking up until the Prisma schema appears. */
export const PROJECT_ROOT = ((): string => {
  let dir = path.resolve(process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not locate prisma/schema.prisma above ${process.cwd()}. Run Playwright from the project root.`,
      );
    }
    dir = parent;
  }
})();

/**
 * Minimal `.env` parser.
 *
 * Handles `KEY=value`, quoted values, `export ` prefixes and comments, which is
 * everything the documented env contract uses. A full dotenv dependency would be
 * one dependency for a file that already exists on disk.
 */
export function parseDotEnv(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const key = match?.[1];
    const rawValue = match?.[2];
    if (key === undefined || rawValue === undefined) continue;

    let value = rawValue.trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length > 1 && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }
    } else {
      const comment = value.indexOf(" #");
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    parsed[key] = value;
  }

  return parsed;
}

/** Local env files, merged in Next.js precedence order (`.env` then `.env.local`). */
export function readLocalEnvFiles(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(PROJECT_ROOT, name);
    if (fs.existsSync(file)) {
      Object.assign(merged, parseDotEnv(fs.readFileSync(file, "utf8")));
    }
  }
  return merged;
}

/** The developer's own `DATABASE_URL`, used only as a connection template. */
function sourceDatabaseUrl(): URL {
  const url = process.env.DATABASE_URL ?? readLocalEnvFiles().DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env or .env.local; the E2E suite derives its own database from it.",
    );
  }
  try {
    return new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
}

/** Database the suite resets and seeds. Created by `prisma migrate reset` if absent. */
export const TEST_DATABASE_NAME = "eagles_eye_test";

/** The connection string the E2E app server and the prepare step both use. */
export function testDatabaseUrl(): string {
  const url = sourceDatabaseUrl();
  url.pathname = `/${TEST_DATABASE_NAME}`;
  return url.toString();
}

/** Port for the E2E app server. Avoids 3000 so a running dev server is untouched. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3410);

/** Origin the browser and the server must agree on. */
export const E2E_ORIGIN = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

/** Covers are stored outside `public/`; the suite owns this directory. */
export const E2E_STORAGE_DIR = path.join(PROJECT_ROOT, ".e2e-storage");

/**
 * Local-only admin credential for the seeded suite.
 *
 * Reuses the developer's `SEED_ADMIN_*` when present, otherwise a clearly
 * labelled fixture that can only ever reach the throwaway local database.
 */
export function seedCredentials(): { email: string; password: string } {
  const files = readLocalEnvFiles();
  return {
    email: process.env.SEED_ADMIN_EMAIL ?? files.SEED_ADMIN_EMAIL ?? "e2e-admin@example.test",
    password:
      process.env.SEED_ADMIN_PASSWORD ?? files.SEED_ADMIN_PASSWORD ?? "e2e-local-only-admin",
  };
}

/**
 * Environment for the E2E app server.
 *
 * The origin and the port must match: the upload route compares the request
 * `Origin` against `NEXT_PUBLIC_APP_URL`, so a mismatch fails every upload with
 * `Request origin is not allowed.`
 *
 * Write and search ceilings are raised well above what the journeys need. The
 * abuse test exercises the login throttle, which is database-backed and keyed by
 * identifier and IP, so it does not depend on these being small.
 */
export function webServerEnv(): Record<string, string> {
  const files = readLocalEnvFiles();
  const { email, password } = seedCredentials();

  return {
    NODE_ENV: "development",
    PORT: String(E2E_PORT),
    DATABASE_URL: testDatabaseUrl(),
    AUTH_SECRET:
      process.env.AUTH_SECRET ?? files.AUTH_SECRET ?? "e2e-local-only-auth-secret-not-a-real-one",
    NEXT_PUBLIC_APP_URL: E2E_ORIGIN,
    STORAGE_LOCAL_DIR: E2E_STORAGE_DIR,
    SESSION_MAX_AGE_SECONDS: "3600",
    SEED_ADMIN_EMAIL: email,
    SEED_ADMIN_PASSWORD: password,
    RATE_LIMIT_LOGIN_ATTEMPTS: "5",
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: "900",
    RATE_LIMIT_WRITE_ACTIONS: "400",
    RATE_LIMIT_WRITE_WINDOW_SECONDS: "60",
    RATE_LIMIT_SEARCH_REQUESTS: "400",
    RATE_LIMIT_SEARCH_WINDOW_SECONDS: "60",
    UPLOAD_MAX_BYTES: String(5 * 1024 * 1024),
  };
}

/**
 * Export the values the specs read from `process.env`.
 *
 * `webServer.env` only reaches the server process. The existing specs read
 * `E2E_BASE_URL` and the seed credentials directly, so the config publishes them
 * here instead of every spec having to import the resolver.
 */
export function publishTestProcessEnv(): void {
  const { email, password } = seedCredentials();
  process.env.E2E_BASE_URL = E2E_ORIGIN;
  process.env.E2E_ORIGIN = E2E_ORIGIN;
  process.env.SEED_ADMIN_EMAIL = email;
  process.env.SEED_ADMIN_PASSWORD = password;
}