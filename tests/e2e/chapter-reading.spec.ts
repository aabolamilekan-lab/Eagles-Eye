import { expect, test } from "./support/fixtures";

/**
 * Public chapter reading journey.
 *
 * Skipped unless `E2E_BASE_URL` points at a running, seeded app. Uses the
 * deterministic seed: `the-cartographers-debt` is `PUBLISHED` with three
 * `PUBLISHED` chapters, so chapter 1 / 2 / 3 and the end state are known.
 * The negative cases prove draft and archived content is unreachable.
 */
const baseURL = process.env.E2E_BASE_URL;

const STORY = "the-cartographers-debt";
const FIRST = "the-commission";
const SECOND = "a-coast-that-moves";
const LAST = "what-the-town-is-owed";

test.describe("chapter reading", () => {
  test.skip(!baseURL, "E2E_BASE_URL is not set.");

  test("reads, follows next and previous, and reaches the end state", async ({
    page,
  }) => {
    await page.goto(`/stories/${STORY}/chapter/${FIRST}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "The Commission" }),
    ).toBeVisible();
    await expect(page.getByText("Chapter 1 of 3").first()).toBeVisible();

    // No previous link on the first chapter.
    await expect(
      page.getByRole("link", { name: /Previous chapter/ }),
    ).toHaveCount(0);

    // Follow next to chapter two.
    await page.getByRole("link", { name: /Next chapter/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/chapter/${SECOND}$`));
    await expect(page.getByText("Chapter 2 of 3").first()).toBeVisible();

    // Follow previous back to chapter one.
    await page.getByRole("link", { name: /Previous chapter/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/chapter/${FIRST}$`));

    // Jump to the last chapter and confirm the explicit end state.
    await page.goto(`/stories/${STORY}/chapter/${LAST}`);
    await expect(page.getByText("Chapter 3 of 3").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Next chapter/ })).toHaveCount(0);
  });

  test("lists every published chapter in the by-index disclosure", async ({
    page,
  }) => {
    await page.goto(`/stories/${STORY}/chapter/${FIRST}`);

    const index = page
      .locator("details")
      .filter({ hasText: "All chapters" });
    await index.locator("summary").click();
    await expect(index.getByRole("link")).toHaveCount(3);
    await expect(
      index.getByRole("link", { name: /A Coast That Moves/ }),
    ).toHaveCount(1);
  });

  test("a draft chapter and an archived story's chapter are not found", async ({
    page,
  }) => {
    const draftStory = await page.goto(
      "/stories/salt-and-cedar/chapter/the-ledger",
    );
    expect(draftStory?.status()).toBe(404);

    const archivedStory = await page.goto(
      "/stories/the-lantern-keeper/chapter/the-lamp",
    );
    expect(archivedStory?.status()).toBe(404);
  });
});
