import {
  createPublishedChapter,
  createStoryDraft,
  publishStory,
  richTextEditor,
  signIn,
  slugify,
} from "./support/admin";
import { E2E_ORIGIN } from "./support/environment";
import { expect, test } from "./support/fixtures";

/**
 * The chapter editor itself.
 *
 * The other suites exercise what the application does with stored content;
 * these four tests exercise the editing surface: formatting applied through
 * the toolbar, the empty-content rule, keyboard operation, and a narrow
 * viewport. Every fixture is built through the real admin interface, so a
 * passing run is evidence about the shipped editor rather than about a test
 * harness.
 */
const STORY_TITLE = "The Ledger of Repairs";
const STORY_SLUG = slugify(STORY_TITLE);
const CHAPTER_TITLE = "The Crossing";
const CHAPTER_SLUG = slugify(CHAPTER_TITLE);

test.describe("chapter editor", () => {
  test("formatting applied to an existing chapter survives save, reload and publication", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: STORY_TITLE,
      shortDescription:
        "A repair ledger, a storm, and a village that keeps its own records.",
    });
    await createPublishedChapter(page, storyId, {
      title: CHAPTER_TITLE,
      content: "Opening line.",
    });

    const editor = richTextEditor(page, "Chapter content");
    await expect(editor).toContainText("Opening line.");

    // Replace the stored body with the finished text first, then format each
    // line through the toolbar. Typing after a toolbar click would race the
    // editor's delayed refocus, and the trailing node StarterKit appends after
    // a heading makes a select-all-then-type flow destroy what it just wrote.
    await editor.click();
    await page.keyboard.press("Control+A");
    await editor.pressSequentially(CHAPTER_TITLE);
    await page.keyboard.press("Enter");
    await editor.pressSequentially("Bold passage");
    await page.keyboard.press("Enter");
    await editor.pressSequentially("Centred line");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Bulleted list" }).click();
    await editor.pressSequentially("Item one");
    await page.keyboard.press("Enter");
    await editor.pressSequentially("Item two");

    const selectLine = async (text: string): Promise<void> => {
      await editor.locator("p", { hasText: text }).click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
    };

    await selectLine(CHAPTER_TITLE);
    await page.getByRole("button", { name: "Section heading" }).click();
    await expect(editor.locator("h2")).toHaveText(CHAPTER_TITLE);

    await selectLine("Bold passage");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(editor.locator("strong")).toHaveText("Bold passage");

    await selectLine("Centred line");
    const alignCentre = page.getByRole("button", { name: "Align centre" });
    await alignCentre.click();
    await expect(alignCentre).toHaveAttribute("aria-pressed", "true");
    await expect(editor.locator('p[style*="text-align"]')).toHaveText(
      "Centred line",
    );

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/edit\?notice=saved$/);

    // Reload: what comes back is what was written, formatting intact.
    await page.reload();
    await expect(editor.locator("h2")).toHaveText(CHAPTER_TITLE);
    await expect(editor.locator("strong")).toHaveText("Bold passage");
    await expect(editor.locator('p[style*="text-align"]')).toHaveText(
      "Centred line",
    );
    await expect(editor.locator("li")).toHaveCount(2);
    await expect(editor.locator("li").nth(0)).toHaveText("Item one");
    await expect(editor.locator("li").nth(1)).toHaveText("Item two");

    // Publish the story and read the same chapter as an anonymous visitor.
    await publishStory(page, storyId);
    const reader = await browser.newContext({ baseURL: E2E_ORIGIN });
    const view = await reader.newPage();
    await view.goto(`/stories/${STORY_SLUG}/chapter/${CHAPTER_SLUG}`);
    await expect(
      view.getByRole("heading", { name: CHAPTER_TITLE, level: 1 }),
    ).toBeVisible();

    const prose = view.locator(".prose");
    // The reader offsets stored headings by one so the page keeps its own h1.
    await expect(prose.locator("h3")).toHaveText(CHAPTER_TITLE);
    await expect(prose.locator("strong")).toHaveText("Bold passage");
    await expect(prose.locator('p[style*="text-align"]')).toHaveText(
      "Centred line",
    );
    await expect(prose.locator("li")).toHaveCount(2);
    await expect(prose.locator("li").nth(0)).toHaveText("Item one");
    await reader.close();
  });

  test("an empty chapter cannot be published", async ({ page }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Silent Hours",
      shortDescription: "A story that has not been written yet.",
    });

    await page.goto(`/admin/stories/${storyId}/chapters/new`);
    await page.getByLabel("Title").fill("Nothing written");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(
      /\/admin\/stories\/[^/]+\/chapters\/[^/]+\/edit\?notice=created$/,
    );

    // An untouched body.
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByText("Add some content before publishing this chapter."),
    ).toBeVisible();
    await expect(page.getByText("Draft. Publish to add it")).toBeVisible();

    // A body that is only whitespace is still empty.
    const editor = richTextEditor(page, "Chapter content");
    await editor.click();
    await editor.pressSequentially("   ");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByText("Add some content before publishing this chapter."),
    ).toBeVisible();
    await expect(page.getByText("Draft. Publish to add it")).toBeVisible();
  });

  test("the formatting toolbar is operable from the keyboard", async ({
    page,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Keyboard Passage",
      shortDescription: "Every control is reachable without a pointer.",
    });
    await createPublishedChapter(page, storyId, {
      title: "Keys",
      content: "Selected by keyboard.",
    });

    await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();

    const editor = richTextEditor(page, "Chapter content");
    await editor.click();
    await page.keyboard.press("Control+A");

    // One tab stop, arrow keys between the controls, per the ARIA toolbar
    // pattern: the selection made in the editor is still the one acted on.
    const bold = page.getByRole("button", { name: "Bold" });
    const italic = page.getByRole("button", { name: "Italic" });
    await bold.focus();
    await expect(bold).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(italic).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(bold).toBeFocused();

    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Enter");
    await expect(editor.locator("strong")).toHaveText("Selected by keyboard.");
    await expect(bold).toHaveAttribute("aria-pressed", "true");
  });

  test("the editor fits a 375px viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Narrow Column",
      shortDescription: "The editor has to work on a phone, not just a laptop.",
    });

    await page.goto(`/admin/stories/${storyId}/chapters/new`);
    await expect(
      page.getByRole("toolbar", { name: "Formatting" }),
    ).toBeVisible();

    for (const name of [
      "Bold",
      "Italic",
      "Section heading",
      "Bulleted list",
      "Quote",
      "Align centre",
      "Insert link",
    ]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // A control that is rendered but pushed off the edge is not usable.
    const box = await page
      .getByRole("button", { name: "Align centre" })
      .boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  });
});
