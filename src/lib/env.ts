import "server-only";
import { z } from "zod";

/**
 * Server-only environment contract.
 *
 * Parsed lazily on first use so that a build step which never touches these
 * values does not require production secrets to be present. The first access in
 * a running server validates every variable and throws a single named error
 * listing what is missing or invalid, instead of failing later at an unclear
 * call site. Secrets have no default.
 *
 * `server-only` makes a Client Component import a build error, so a private
 * value can never silently resolve to `undefined` in a browser bundle.
 *
 * AGENTS.md sections 12 and 13.
 */
const REQUIRED_STORAGE_KEYS = [
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Database -----------------------------------------------------------
  DATABASE_URL: z.string().min(1),

  // --- Auth ---------------------------------------------------------------
  // 32+ characters of entropy. No default; a weak secret is a hard failure.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(604800),

  // --- App ----------------------------------------------------------------
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // --- Rate limiting ------------------------------------------------------
  RATE_LIMIT_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  RATE_LIMIT_WRITE_ACTIONS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WRITE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  // Public search is a read, but an expensive one. A generous per-IP ceiling
  // stops a scanner from turning the catalogue into a load test.
  RATE_LIMIT_SEARCH_REQUESTS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_SEARCH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  // --- Storage (private bucket) ------------------------------------------
  // All five S3 values must be present together to select the S3 driver.
  // Without them, development and tests fall back to a private filesystem
  // root; production refuses to start rather than accept uploads it cannot
  // store. `STORAGE_LOCAL_DIR` exists only for that fallback.
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  STORAGE_LOCAL_DIR: z.string().optional(),

  // --- Uploads ------------------------------------------------------------
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5242880),

  // --- Seed (local development only) --------------------------------------
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") {
    return;
  }
  for (const key of REQUIRED_STORAGE_KEYS) {
    if ((env[key] ?? "").trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when NODE_ENV=production.`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validate and return the environment.
 *
 * Throws a single `Error` whose message names the invalid keys and never
 * contains a value. The manager caches the parsed result after first success.
 */
export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const keys = [
      ...new Set(
        parsed.error.issues
          .map((issue) => issue.path.join("."))
          .filter((path) => path.length > 0),
      ),
    ];
    throw new Error(
      `Invalid environment configuration. Missing or invalid: ${keys.join(", ")}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test seam: forget the cached parse so a test can supply a fresh environment. */
export function resetEnvCacheForTests(): void {
  cached = null;
}

/** True only when running the production server. Drives cookie `Secure`. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
