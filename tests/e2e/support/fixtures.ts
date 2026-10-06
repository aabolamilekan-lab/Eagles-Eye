import { expect, test as base } from "@playwright/test";

/**
 * Per-test network identity.
 *
 * Several security controls bucket by client IP, so a suite that shares one
 * connection pool also shares one bucket: one test's deliberate abuse would
 * throttle every other test, and the run would depend on execution order.
 *
 * The app trusts `x-forwarded-for` because a reverse proxy sets it in a real
 * deployment. Here it gives every test its own bucket without changing a line of
 * application code. Each address comes from the RFC 5737 documentation range and
 * is allocated per test, so no test can exhaust another's allowance.
 */
let allocatedIps = 0;

export const test = base.extend<{ clientIp: string }>({
  clientIp: [
    async ({ page }, use) => {
      allocatedIps += 1;
      const ip = `203.0.113.${(allocatedIps % 250) + 1}`;
      await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use(ip);
    },
    { auto: true },
  ],
});

export { expect };
