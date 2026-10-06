import { expect, test } from "./support/fixtures";

/**
 * Public search journey.
 *
 * Skipped unless `E2E_BASE_URL` points at a running, seeded app. Uses the
 * deterministic seed so expected results are known: three published stories,
 * one draft (`salt-and-cedar`) and one archived (`the-lantern-keeper`) that must
 * never appear.
 */
const baseURL = process.env.E2E_BASE_URL;

test.describe("search", () => {
  test.skip(!baseURL, "E2E_BASE_URL is not set.");

  test("finds a published story by title, description and author", async ({
    page,
  }) => {
    await page.goto("/search?q=Kestrel");
    await expect(
      page.getByRole("heading", { level: 1, name: "Search stories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Signal From Kestrel Station" }),
    ).toBeVisible();

    await page.goto("/search?q=mapmaker");
    await expect(
      page.getByRole("link", { name: "The Cartographer's Debt" }),
    ).toBeVisible();

    await page.goto("/search?q=Vela");
    await expect(
      page.getByRole("link", { name: "Signal From Kestrel Station" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Paper Boats to Anywhere" }),
    ).toBeVisible();
  });

  test("never surfaces draft or archived stories", async ({ page }) => {
    // "ledger" appears in the draft story's content. Other specs publish
    // stories that share the term, so assert the rule rather than an empty
    // result set: the draft must be absent from the results entirely.
    await page.goto("/search?q=ledger");
    await expect(
      page.locator('a[href="/stories/salt-and-cedar"]'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Salt and Cedar" }),
    ).toHaveCount(0);

    // "lighthouse" appears only in the archived story's short description.
    await page.goto("/search?q=lighthouse");
    await expect(page.getByText(/No results/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "The Lantern Keeper" }),
    ).toHaveCount(0);
    await expect(
      page.locator('a[href="/stories/the-lantern-keeper"]'),
    ).toHaveCount(0);
  });

  test("filters by category and tag through the URL", async ({ page }) => {
    await page.goto("/search?category=frontier-chronicles");
    await expect(
      page.getByRole("link", { name: "The Cartographer's Debt" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Signal From Kestrel Station" }),
    ).toHaveCount(0);

    await page.goto("/search?tag=science-fiction");
    await expect(
      page.getByRole("link", { name: "Signal From Kestrel Station" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "The Cartographer's Debt" }),
    ).toHaveCount(0);
  });

  test("keeps the term when a facet is applied", async ({ page }) => {
    await page.goto("/search?q=Vela");

    // On a small screen the facets live behind a disclosure, so open it first.
    // The select itself is the thing under test, not the disclosure.
    const category = page.getByLabel("Category");
    if (!(await category.isVisible())) {
      await page.getByText("Filters", { exact: true }).click();
    }

    await category.selectOption("roots-and-rivers");
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page).toHaveURL(/q=Vela/);
    await expect(page).toHaveURL(/category=roots-and-rivers/);
    await expect(
      page.getByRole("link", { name: "Paper Boats to Anywhere" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Signal From Kestrel Station" }),
    ).toHaveCount(0);
  });

  test("collapses facets behind a disclosure on small screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/search?q=Vela");

    const summary = page.getByText("Filters", { exact: true });
    await expect(summary).toBeVisible();
    await expect(page.getByLabel("Category")).toBeHidden();

    await summary.click();
    await expect(page.getByLabel("Category")).toBeVisible();
  });
});
