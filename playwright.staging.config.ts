import { defineConfig, devices } from "@playwright/test";

import { E2E_ORIGIN, publishTestProcessEnv } from "./tests/e2e/support/environment";

/**
 * Staging verification configuration.
 *
 * Runs the same end-to-end suites as `playwright.config.ts`, but against an
 * already-deployed server instead of starting one. Nothing here provisions a
 * database or a storage directory: the target environment owns those, so a pass
 * is evidence about the deployment rather than about a test harness.
 *
 * Usage:
 *   E2E_BASE_URL=http://localhost:3001 SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
 *     npx playwright test -c playwright.staging.config.ts
 *
 * Two projects cover the two viewports the release gate asks for. The mobile
 * project runs the reader-facing and sign-in journeys, which are the surfaces a
 * phone actually reaches; the admin publishing workflow stays on the desktop
 * project because it drives dense tables that are not the mobile experience.
 */
publishTestProcessEnv();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: E2E_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: "staging-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "staging-mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /(auth|chapter-reading|search|publishing-lifecycle)\.spec\.ts$/,
    },
  ],
});
