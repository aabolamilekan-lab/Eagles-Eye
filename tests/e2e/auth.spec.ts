import { expect, test } from "./support/fixtures";

/**
 * Admin authentication journeys.
 *
 * Skipped unless `E2E_BASE_URL` points at a running, seeded app. The signed-out
 * journey needs no credentials; the signed-in journeys additionally require the
 * seed admin via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
 */
const baseURL = process.env.E2E_BASE_URL;
const seedEmail = process.env.SEED_ADMIN_EMAIL;
const seedPassword = process.env.SEED_ADMIN_PASSWORD;

test.describe("admin authentication", () => {
  test.skip(!baseURL, "E2E_BASE_URL is not set.");

  test("every protected route redirects to sign-in when signed out", async ({
    page,
  }) => {
    for (const path of [
      "/admin",
      "/admin/stories",
      "/admin/categories",
      "/admin/settings",
      "/admin/tags",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/login$/);
    }
  });

  test("signing in reaches the dashboard and signing out revokes the session", async ({
    page,
    context,
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

    const cookie = (await context.cookies()).find((entry) => entry.name === "ee_session");
    expect(cookie?.httpOnly).toBe(true);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("an unknown email and a wrong password render the same message", async ({ page }) => {
    if (!seedEmail) {
      test.skip(true, "SEED_ADMIN_EMAIL is not set.");
      return;
    }

    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("some-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    const unknown = await page.getByText("Invalid email or password.").textContent();

    await page.getByLabel("Email").fill(seedEmail);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    const wrong = await page.getByText("Invalid email or password.").textContent();

    expect(unknown).toBe(wrong);
  });
});
