import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  E2E_STORAGE_DIR,
  PROJECT_ROOT,
  seedCredentials,
  testDatabaseUrl,
} from "./environment";

/**
 * Prepare the E2E database and storage before the app server starts.
 *
 * Runs from the Playwright `webServer` command rather than `globalSetup` so the
 * ordering is unambiguous: the schema and seed are in place before the first
 * request the suite can make.
 *
 * `prisma migrate reset` creates the database when it is missing, drops
 * everything else, and replays every migration, so a run starts from a known
 * schema with no leftover rows — including `LoginAttempt`, which would otherwise
 * let a previous run's failures throttle this one.
 *
 * The seed refuses to run against a non-local host or under `NODE_ENV=production`,
 * both of which this script respects by passing through the environment.
 */
function run(label: string, script: string, args: string[]): void {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...webServerOverrides() },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    process.stderr.write(`E2E prepare failed during ${label}.\n${detail}\n`);
    process.exit(result.status ?? 1);
  }
}

/** The exact environment the app server gets, so both use one database. */
function webServerOverrides(): Record<string, string> {
  const { email, password } = seedCredentials();
  return {
    DATABASE_URL: testDatabaseUrl(),
    SEED_ADMIN_EMAIL: email,
    SEED_ADMIN_PASSWORD: password,
  };
}

/** Remove covers from a previous run so a stale object cannot satisfy a test. */
function resetStorageDir(): void {
  fs.rmSync(E2E_STORAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(E2E_STORAGE_DIR, { recursive: true });
}

function main(): void {
  const prisma = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");
  const tsx = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

  resetStorageDir();

  run("migrate reset", prisma, [
    "migrate",
    "reset",
    "--force",
    "--skip-seed",
    "--skip-generate",
  ]);
  run("seed", tsx, [path.join(PROJECT_ROOT, "prisma", "seed.ts")]);

  process.stderr.write("E2E database reset and seeded.\n");
}

main();