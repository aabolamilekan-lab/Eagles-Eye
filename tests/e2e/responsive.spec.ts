import type { Page } from "@playwright/test";

import { signIn } from "./support/admin";
import { expect, test } from "./support/fixtures";

/**
 * Responsive behaviour across desktop, tablet and mobile.
 *
 * The three sizes are the classes a reader actually uses: a laptop, a tablet
 * held in portrait, and a phone. Every assertion is about visible behaviour —
 * the page fits without sideways scrolling, headings are present, and each
 * navigation surface is operable at its size — not about which class produced
 * it. Public routes run against the deterministic seed; the admin shell signs
 * in through the real login form.
 */
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 375, height: 667 },
} as const;

const PUBLIC_ROUTES = [
  "/",
  "/stories",
  `/stories/the-cartographers-debt`,
  `/stories/the-cartographers-debt/chapter/the-commission`,
  "/categories",
  "/categories/frontier-chronicles",
  "/search?q=wind",
  "/about",
];

/** The document must not scroll sideways at the current viewport. */
async function expectFitsViewport(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("responsive behaviour", () => {
  test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL is not set.");

  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    test(`the public reading surface fits a ${label} viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      for (const route of PUBLIC_ROUTES) {
        await test.step(route, async () => {
          const response = await page.goto(route);
          expect(response?.status()).toBe(200);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expectFitsViewport(page);
        });
      }
    });
  }

  test("site navigation is inline on desktop and a disclosure below lg", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByLabel("Open menu")).toBeHidden();

    // The lg breakpoint is 1024px: both smaller classes use the disclosure.
    for (const viewport of [VIEWPORTS.tablet, VIEWPORTS.mobile]) {
      await page.setViewportSize(viewport);
      await expect(page.getByLabel("Open menu")).toBeVisible();

      await page.getByLabel("Open menu").click();
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Stories", exact: true })
        .click();
      await expect(page).toHaveURL(/\/stories$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Return to the home page for the next size through the same menu.
      await page.getByLabel("Open menu").click();
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Categories", exact: true })
        .click();
      await expect(page).toHaveURL(/\/categories$/);
    }
  });

  test("chapter controls are visible and operable on a phone", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/stories/the-cartographers-debt/chapter/the-commission");

    await expect(page.getByText("Chapter 1 of 3").first()).toBeVisible();
    await expectFitsViewport(page);

    const next = page.getByRole("link", { name: /Next chapter/ }).first();
    await expect(next).toBeVisible();
    const box = await next.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1)).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      VIEWPORTS.mobile.width,
    );

    await next.click();
    await expect(page).toHaveURL(/\/chapter\/a-coast-that-moves$/);
    await expect(
      page.getByRole("link", { name: "Back to The Cartographer's Debt" }),
    ).toBeVisible();
    await expectFitsViewport(page);
  });

  test("the admin shell adapts its navigation to the viewport", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await signIn(page);
    await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Menu", { exact: true })).toBeHidden();

    // Below lg the sidebar becomes the drawer.
    await page.setViewportSize(VIEWPORTS.mobile);
    const drawer = page.getByText("Menu", { exact: true });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin" })).toBeHidden();
    await expectFitsViewport(page);

    await drawer.click();
    await page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Dashboard" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();
    await expectFitsViewport(page);
  });
});
