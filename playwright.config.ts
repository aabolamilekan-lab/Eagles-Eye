import { defineConfig, devices } from "@playwright/test";

import {
  E2E_ORIGIN,
  publishTestProcessEnv,
  webServerEnv,
} from "./tests/e2e/support/environment";

/**
 * End-to-end configuration.
 *
 * `npm run test:e2e` is self-contained: the web server command resets and seeds a
 * dedicated PostgreSQL database and then starts a development server bound to a
 * private port. Nothing touches the development database, and no manual setup is
 * required.
 *
 * The server runs `next dev` on purpose. Production storage configuration
 * refuses the private filesystem fallback by design (AGENTS.md section 11), and
 * the cover upload journey has to be exercised end to end, so the suite uses the
 * development driver and points it at a throwaway directory.
 *
 * `workers: 1` because the suites share one seeded database and, in the login
 * case, one `LoginAttempt` table. The rate limiters that key on client IP are
 * isolated per test by a forwarded address (see `support/fixtures.ts`), so the
 * ordering that remains is genuine content ordering, not limiter contention.
 */
publishTestProcessEnv();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: E2E_ORIGIN,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run e2e:prepare && npm run e2e:serve",
    url: E2E_ORIGIN,
    env: webServerEnv(),
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
