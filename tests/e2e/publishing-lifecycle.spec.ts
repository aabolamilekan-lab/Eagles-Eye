import type { Browser, Page } from "@playwright/test";

import {
  createCategory,
  createPublishedChapter,
  createStoryDraft,
  createTag,
  publishStory,
  signIn,
  unpublishStory,
} from "./support/admin";
import { E2E_ORIGIN } from "./support/environment";
import { expect, test } from "./support/fixtures";
import { coverPng } from "./support/images";

/**
 * Admin publishing, then public reading, then removal.
 *
 * The three tests are serial because each depends on data the previous one
 * created. That is a deliberate reflection of the journey being covered, and the
 * suite still runs with one worker so no other spec can interleave.
 *
 * The reader half runs in a separate browser context. "Anonymous" is therefore a
 * fact about the test rather than an assumption: no admin cookie exists there.
 */
const CATEGORY = "E2E Imaginaries";
const CATEGORY_SLUG = "e2e-imaginaries";
const TAG = "e2e-verified";
const TITLE = "The Tide-Table Bride";
const SLUG = "the-tide-table-bride";
const FIRST_CHAPTER = "The Wager";
const SECOND_CHAPTER = "Neap";
const FIRST_CHAPTER_SLUG = "the-wager";
const SECOND_CHAPTER_SLUG = "neap";

async function anonymousPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E_ORIGIN });
  return context.newPage();
}

test.describe.configure({ mode: "serial" });

test.describe("publishing lifecycle", () => {
  let storyId = "";

  test("an administrator publishes a story with chapters and a cover", async ({
    page,
  }) => {
    await signIn(page);

    await createCategory(page, CATEGORY);
    await createTag(page, TAG);

    storyId = await createStoryDraft(page, {
      title: TITLE,
      author: "E2E Fixture",
      shortDescription: "A tide table, a wager, and a coast that will not hold still.",
      description: "Salt, ledgers, and a lighthouse keeper with a debt to pay.",
      categoryName: CATEGORY,
      tagNames: [TAG],
      cover: await coverPng(),
    });

    // The cover was re-encoded and stored under a generated key, never the
    // uploaded file name.
    const coverKey = await page.getByLabel("Cover image key").inputValue();
    expect(coverKey).toMatch(/^covers\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/);
    expect(coverKey).not.toContain("cover-png");

    // Two chapters, each created as a draft and then published on purpose.
    const firstChapterId = await createPublishedChapter(page, storyId, {
      title: FIRST_CHAPTER,
      content: "She wrote the tide table out by hand, then read it back to him.",
    });
    expect(firstChapterId).not.toBe("");

    const secondChapterId = await createPublishedChapter(page, storyId, {
      title: SECOND_CHAPTER,
      content: "The tide kept its own counsel, which is to say nothing at all.",
    });
    expect(secondChapterId).not.toBe("");

    await publishStory(page, storyId);

    // Featuring is a separate decision, and it only works on a published story.
    await page.getByRole("button", { name: "Feature on the home page" }).click();
    await expect(page).toHaveURL(/\/edit\?notice=featured$/);
  });

  test("a reader finds the story and reads every chapter", async ({ browser }) => {
    const reader = await anonymousPage(browser);

    // Home: the featured rail, not merely the recent list.
    await reader.goto("/");
    const featured = reader.locator("section", {
      has: reader.getByRole("heading", { name: "Featured stories" }),
    });
    await expect(featured.getByRole("link", { name: TITLE })).toBeVisible();

    // Catalogue.
    await reader.goto("/stories");
    await reader.getByRole("link", { name: TITLE }).click();
    await expect(reader).toHaveURL(new RegExp(`/stories/${SLUG}$`));

    // Story detail: the real metadata a reader relies on.
    const storyHeader = reader.locator("header", {
      has: reader.getByRole("heading", { name: TITLE, level: 1 }),
    });
    await expect(storyHeader.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
    await expect(storyHeader.getByRole("link", { name: CATEGORY })).toBeVisible();
    await expect(storyHeader.getByRole("link", { name: TAG })).toBeVisible();

    // The table of contents, in reading order. Scoped to the list so the
    // "Start reading" call to action is not counted as a chapter row.
    const chapterRows = reader.locator(`ol a[href^="/stories/${SLUG}/chapter/"]`);
    await expect(chapterRows).toHaveCount(2);
    await expect(chapterRows.nth(0)).toContainText(FIRST_CHAPTER);
    await expect(chapterRows.nth(1)).toContainText(SECOND_CHAPTER);
    // Public story detail never states a chapter or read volume.
    await expect(reader.getByText("2 chapters")).toHaveCount(0);

    // Search reaches the same story from a different entry point.
    await reader.goto("/search?q=Tide-Table");
    await expect(reader.getByRole("link", { name: TITLE })).toBeVisible();

    // Category page.
    await reader.goto(`/categories/${CATEGORY_SLUG}`);
    await expect(reader.getByRole("link", { name: TITLE })).toBeVisible();

    // Chapter one: first position, so there is nothing before it.
    const chapterNav = reader.getByRole("navigation", { name: "Chapter navigation" });
    await reader.goto(`/stories/${SLUG}/chapter/${FIRST_CHAPTER_SLUG}`);
    await expect(reader.getByRole("heading", { name: FIRST_CHAPTER, level: 1 })).toBeVisible();
    await expect(chapterNav.getByText("Chapter 1 of 2")).toBeVisible();
    await expect(reader.getByRole("link", { name: /Previous chapter/ })).toHaveCount(0);

    // Forward to the last chapter.
    await chapterNav.getByRole("link", { name: /Next chapter/ }).first().click();
    await expect(reader).toHaveURL(
      new RegExp(`/stories/${SLUG}/chapter/${SECOND_CHAPTER_SLUG}$`),
    );
    await expect(chapterNav.getByText("Chapter 2 of 2")).toBeVisible();
    await expect(reader.getByRole("link", { name: /Next chapter/ })).toHaveCount(0);

    // And back again, proving navigation is bidirectional.
    await chapterNav.getByRole("link", { name: /Previous chapter/ }).first().click();
    await expect(reader).toHaveURL(
      new RegExp(`/stories/${SLUG}/chapter/${FIRST_CHAPTER_SLUG}$`),
    );

    // The reader really is anonymous: no session cookie was ever issued here.
    const cookies = await reader.context().cookies();
    expect(cookies.filter((cookie) => cookie.name.includes("session"))).toHaveLength(0);
  });

  test("reordering chapters rewrites the public reading order", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    await page.goto(`/admin/stories/${storyId}/chapters`);

    const rows = page.locator('form:has(input[name="order"]) > ol > li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(FIRST_CHAPTER);
    await expect(rows.nth(1)).toContainText(SECOND_CHAPTER);

    // Move the first chapter down through the real control, then commit.
    await page
      .getByRole("button", { name: `Move ${FIRST_CHAPTER} down` })
      .click();
    await expect(page.getByRole("button", { name: "Save order" })).toBeEnabled();
    await page.getByRole("button", { name: "Save order" }).click();
    await expect(page).toHaveURL(/\/chapters\?notice=reordered$/);

    // The stored order followed the arrangement.
    await expect(rows.nth(0)).toContainText(SECOND_CHAPTER);
    await expect(rows.nth(1)).toContainText(FIRST_CHAPTER);

    // An anonymous reader sees the same order, and the chapter numbers were
    // rewritten rather than duplicated: the moved chapter is now 1 of 2.
    const reader = await anonymousPage(browser);
    await reader.goto(`/stories/${SLUG}`);
    const chapterRows = reader.locator(`ol a[href^="/stories/${SLUG}/chapter/"]`);
    await expect(chapterRows).toHaveCount(2);
    await expect(chapterRows.nth(0)).toContainText(SECOND_CHAPTER);
    await expect(chapterRows.nth(1)).toContainText(FIRST_CHAPTER);

    await reader.goto(`/stories/${SLUG}/chapter/${SECOND_CHAPTER_SLUG}`);
    await expect(reader.getByText("Chapter 1 of 2").first()).toBeVisible();
    await reader.close();
  });

  test("unpublishing removes the story from every public surface", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    await unpublishStory(page, storyId);
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

    const reader = await anonymousPage(browser);

    const detail = await reader.goto(`/stories/${SLUG}`);
    expect(detail?.status()).toBe(404);

    const catalogue = await reader.goto("/stories");
    expect(catalogue?.status()).toBe(200);
    await expect(reader.getByRole("link", { name: TITLE })).toHaveCount(0);

    await reader.goto("/search?q=Tide-Table");
    await expect(reader.getByRole("link", { name: TITLE })).toHaveCount(0);

    // The category no longer holds a published story, so it stops resolving.
    const category = await reader.goto(`/categories/${CATEGORY_SLUG}`);
    expect(category?.status()).toBe(404);

    await reader.goto("/");
    await expect(reader.getByRole("link", { name: TITLE })).toHaveCount(0);
  });
});
