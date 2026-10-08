import { createHash } from "node:crypto";

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
 * application code. The address is derived from the test's own id, so it is
 * unique for every test in the run and survives worker restarts — no shared
 * counter that a restart could reset into a collision with an address another
 * test already exhausted.
 */
export const test = base.extend<{ clientIp: string }>({
  clientIp: [
    async ({ page }, use, testInfo) => {
      const digest = createHash("sha256")
        .update(`${testInfo.file}:${testInfo.line}:${testInfo.title}`)
        .digest();
      const ip = `10.${digest.subarray(0, 3).join(".")}`;
      await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use(ip);
    },
    { auto: true },
  ],
});

export { expect };
