import { expect, test } from "./support/fixtures";

/**
 * Admin dashboard journey.
 *
 * Skipped unless `E2E_BASE_URL` points at a running, seeded app and the seed
 * admin credentials are present. Proves the signed-in dashboard renders the
 * real catalogue surfaces rather than the old unavailable placeholder.
 */
const baseURL = process.env.E2E_BASE_URL;
const seedEmail = process.env.SEED_ADMIN_EMAIL;
const seedPassword = process.env.SEED_ADMIN_PASSWORD;

test.describe("admin dashboard", () => {
  test.skip(!baseURL, "E2E_BASE_URL is not set.");

  test("shows catalogue statistics, recent content, and quick actions", async ({
    page,
  }) => {
    if (!seedEmail || !seedPassword) {
      test.skip(true, "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set.");
      return;
    }

    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(seedEmail);
    await page.getByLabel("Password").fill(seedPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Stat figures, counted from the database.
    await expect(page.getByText("Published stories")).toBeVisible();
    await expect(page.getByText("Draft stories")).toBeVisible();
    await expect(page.getByText("Story views")).toBeVisible();

    // Panels and the seeded catalogue tables.
    await expect(
      page.getByRole("heading", { name: "Publication" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent stories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent chapters" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Quick actions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: /Recently updated stories/ }),
    ).toBeVisible();

    // The active route is marked in the sidebar.
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
