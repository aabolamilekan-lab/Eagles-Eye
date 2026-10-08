import { expect, test } from "./support/fixtures";

/**
 * The complete reader journey, as one chained test.
 *
 * Each step reaches the next through the interface a reader actually uses —
 * header navigation, the search form, facets, cards, the reading call to
 * action, and the chapter controls — so a broken link between surfaces fails
 * here even when every page renders correctly on its own. Uses the
 * deterministic seed: `the-cartographers-debt` is `PUBLISHED` with three
 * `PUBLISHED` chapters in category `frontier-chronicles`.
 */
const TITLE = "The Cartographer's Debt";
const SLUG = "the-cartographers-debt";

test.describe("reader journey", () => {
  test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL is not set.");

  test("a reader browses, searches, filters, reads and navigates chapters", async ({
    page,
  }) => {
    // 1. Home page.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 2. Browse the catalogue through the header navigation.
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Stories", exact: true })
      .click();
    await expect(page).toHaveURL(/\/stories$/);
    await expect(page.getByRole("link", { name: TITLE })).toBeVisible();

    // The draft story is not part of the browse.
    await expect(page.locator('a[href="/stories/salt-and-cedar"]')).toHaveCount(0);

    // 3. Search for a term that appears in the story's description.
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Search", exact: true })
      .click();
    await expect(page).toHaveURL(/\/search$/);
    await page.getByLabel("Search stories").fill("mapmaker");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/[?&]q=mapmaker/);
    await expect(page.getByRole("link", { name: TITLE })).toBeVisible();

    // 4. Narrow the results to the story's category.
    const category = page.getByLabel("Category");
    if (!(await category.isVisible())) {
      await page.getByText("Filters", { exact: true }).click();
    }
    await category.selectOption("frontier-chronicles");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/category=frontier-chronicles/);
    await expect(page.getByRole("link", { name: TITLE })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Signal From Kestrel Station" }),
    ).toHaveCount(0);

    // 5. Open the story from the results.
    await page.getByRole("link", { name: TITLE }).click();
    await expect(page).toHaveURL(new RegExp(`/stories/${SLUG}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();

    // 6. Start reading at the first chapter.
    await page.getByRole("link", { name: "Start reading" }).click();
    await expect(page).toHaveURL(new RegExp(`/stories/${SLUG}/chapter/the-commission$`));

    // 7. Read: the chapter body is real stored content, and position 1 of 3.
    await expect(page.locator(".prose").first()).toContainText("harbourmaster");
    await expect(page.getByText("Chapter 1 of 3").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Previous chapter/ })).toHaveCount(0);

    // 8. Follow "Next chapter" and watch the position and index update.
    await page.getByRole("link", { name: /Next chapter/ }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/stories/${SLUG}/chapter/a-coast-that-moves$`),
    );
    await expect(page.getByText("Chapter 2 of 3").first()).toBeVisible();

    const index = page.locator("details").filter({ hasText: "All chapters" });
    await index.locator("summary").click();
    await expect(index.getByRole("link")).toHaveCount(3);

    // 9. Follow "Previous chapter" back to where the reader started.
    await page.getByRole("link", { name: /Previous chapter/ }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/stories/${SLUG}/chapter/the-commission$`),
    );
    await expect(page.getByText("Chapter 1 of 3").first()).toBeVisible();

    // 10. Return to the story from the chapter.
    await page.getByRole("link", { name: `Back to ${TITLE}` }).click();
    await expect(page).toHaveURL(new RegExp(`/stories/${SLUG}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
  });
});
