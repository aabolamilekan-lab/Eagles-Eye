import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import { readLocalEnvFiles, TEST_FILESYSTEM_STORAGE_ENV } from "./tests/e2e/support/environment";

/**
 * Integration test project.
 *
 * Requires a real PostgreSQL database (`DATABASE_URL`). Files guard themselves
 * with `describe.skipIf` so `npm run test:integration` is a no-op without one.
 *
 * Vitest does not load `.env` files on its own. Without loading them here,
 * `DATABASE_URL` is only present when a test file happens to import Prisma at
 * runtime, so integration files that import Prisma type-only silently skip.
 * The documented env files are loaded into the process first; a value already
 * present in the real environment (for example CI) always wins.
 *
 * Object storage is the exception and is forced to the filesystem driver
 * afterwards. The upload and image suites set `STORAGE_LOCAL_DIR` and expect
 * their writes to land there; a real bucket configured in `.env` or in the
 * surrounding environment would otherwise receive them.
 */
for (const [key, value] of Object.entries(readLocalEnvFiles())) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

Object.assign(process.env, TEST_FILESYSTEM_STORAGE_ENV);

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
});