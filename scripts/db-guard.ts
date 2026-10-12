import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Database Target Safety Guard.
 *
 * Enforces a strict, fail-closed barrier before executing database-mutating Prisma commands.
 * Validates that the resolved DATABASE_URL targets an explicitly allowlisted local host
 * and prevents accidental execution against remote databases (e.g. Neon, AWS, Cloud).
 *
 * In accordance with Eagles Eye safety requirements:
 * 1. Fails closed if DATABASE_URL is missing, malformed, or targets a non-local host.
 * 2. Hostname is validated by strict exact match against an allowlist (no substring assumptions).
 * 3. No unrestricted bypass flag is provided: remote mutations require separately reviewed procedures.
 */

export const ALLOWED_LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
  "postgres",
  "db",
]);

export interface TargetValidationResult {
  ok: boolean;
  hostname?: string;
  reason?: string;
}

/**
 * Strictly validate that a database connection string targets an approved local host.
 * Pure function: testable without network or database connections.
 */
export function validateDatabaseTarget(rawUrl: string | undefined): TargetValidationResult {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return {
      ok: false,
      reason: "DATABASE_URL is not set or is empty.",
    };
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "DATABASE_URL is not a valid URL format.",
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    return {
      ok: false,
      reason: `Unsupported database protocol '${parsed.protocol}'. Expected postgres: or postgresql:.`,
    };
  }

  const rawHostname = parsed.hostname;
  if (!rawHostname) {
    return {
      ok: false,
      reason: "DATABASE_URL does not contain a hostname.",
    };
  }

  const hostname = rawHostname.toLowerCase();

  // Strict exact match against allowlist
  if (!ALLOWED_LOCAL_HOSTS.has(hostname)) {
    return {
      ok: false,
      hostname,
      reason: `Refusing database mutation: target hostname '${hostname}' is not in the approved local host allowlist.`,
    };
  }

  return {
    ok: true,
    hostname,
  };
}

/**
 * Locate project root by walking up until prisma/schema.prisma is found.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate prisma/schema.prisma above ${startDir}.`);
    }
    dir = parent;
  }
}

/**
 * Minimal dotenv line parser.
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

/**
 * Read local environment files in Next.js precedence order (.env then .env.local).
 */
export function readLocalEnvFiles(projectRoot: string = findProjectRoot()): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(projectRoot, name);
    if (fs.existsSync(file)) {
      Object.assign(merged, parseDotEnv(fs.readFileSync(file, "utf8")));
    }
  }
  return merged;
}

/**
 * Resolve the effective DATABASE_URL for local execution.
 */
export function resolveEffectiveDatabaseUrl(projectRoot: string = findProjectRoot()): string | undefined {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL;
  }
  const localEnv = readLocalEnvFiles(projectRoot);
  return localEnv.DATABASE_URL;
}

/**
 * Execute the delegated Prisma CLI command after target verification.
 */
export function main(args: string[] = process.argv.slice(2)): void {
  if (args.length === 0) {
    process.stderr.write("Database safety guard: no Prisma command specified.\n");
    process.exit(1);
  }

  const projectRoot = findProjectRoot();
  const dbUrl = resolveEffectiveDatabaseUrl(projectRoot);

  const validation = validateDatabaseTarget(dbUrl);
  if (!validation.ok) {
    process.stderr.write(`\n[DATABASE SAFETY GUARD] EXECUTION BLOCKED\n`);
    process.stderr.write(`Reason: ${validation.reason}\n`);
    process.stderr.write(`Target database must be an explicitly approved local host (e.g. localhost:5432).\n\n`);
    process.exit(1);
  }

  // Target is verified local: ensure DATABASE_URL is set in environment for Prisma CLI
  const childEnv = { ...process.env, DATABASE_URL: dbUrl };

  const prismaPath = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaPath)) {
    process.stderr.write(`Database safety guard: Prisma CLI binary not found at ${prismaPath}\n`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [prismaPath, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    env: childEnv,
  });

  process.exit(result.status ?? 1);
}

// Only execute when invoked directly as a script
if (require.main === module) {
  main();
}
