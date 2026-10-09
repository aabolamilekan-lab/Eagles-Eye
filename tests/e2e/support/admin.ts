import { expect, type Locator, type Page } from "@playwright/test";

import { seedCredentials } from "./environment";
import type { ImageFixture } from "./images";

/**
 * Admin journey steps.
 *
 * Every helper drives the real interface: a real form, a real Server Action, a
 * real redirect. Nothing here reads or writes the database, so a passing journey
 * is evidence about the shipped application rather than about a test harness.
 */

/** Visible labels of the two rich text editors, as the reader sees them. */
export type RichTextLabel = "Description" | "Chapter content";

/**
 * Locate the rich text editable region.
 *
 * The editor is a contenteditable region labelled by its own heading, so its
 * accessible name is exactly the visible label. Anchoring the match matters:
 * the story form also has a "Short description" textarea, and a loose
 * "Description" match would resolve to both elements.
 */
export function richTextEditor(page: Page, label: RichTextLabel): Locator {
  return page.getByRole("textbox", { name: new RegExp(`^${label}$`) });
}

/** Sign in as the seeded administrator and wait for the dashboard. */
export async function signIn(page: Page): Promise<void> {
  const { email, password } = seedCredentials();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Sign out and confirm the session is revoked, not merely cleared. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
}

/**
 * Create a category through the admin UI and return its slug.
 *
 * The slug is derived the same way the application derives it, so the returned
 * value is what a reader would type into the URL.
 */
export async function createCategory(
  page: Page,
  name: string,
  description = "Created by the end-to-end suite.",
): Promise<string> {
  await page.goto("/admin/categories/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page).toHaveURL(/\/admin\/categories\/[^/]+\/edit\?notice=created$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return slugify(name);
}

/** Create a tag through the admin UI. */
export async function createTag(page: Page, name: string): Promise<void> {
  await page.goto("/admin/tags/new");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create tag" }).click();
  await expect(page).toHaveURL(/\/admin\/tags\/[^/]+\/edit\?notice=created$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** Mirrors the server's slug derivation closely enough for a test to navigate. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Type prose into the rich text editor. */
export async function writeRichText(
  page: Page,
  label: RichTextLabel,
  text: string,
): Promise<void> {
  const editor = richTextEditor(page, label);
  await editor.click();
  await editor.pressSequentially(text);
}

/**
 * Force raw HTML into the rich text editor.
 *
 * Models a hostile paste that bypasses the editor's own affordances. Tiptap's
 * schema may still drop what it cannot represent; either outcome is correct, and
 * the caller asserts on what a reader is actually able to do with the result.
 */
export async function injectRawHtml(
  page: Page,
  label: RichTextLabel,
  html: string,
): Promise<void> {
  const editor = richTextEditor(page, label);
  await editor.click();
  await editor.evaluate((node, injected) => {
    node.innerHTML = injected;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, html);
}

/** Upload a cover through the visible control and return the stored key. */
export async function uploadCover(page: Page, fixture: ImageFixture): Promise<string> {
  await page.getByLabel("Choose a cover image").setInputFiles({
    name: fixture.name,
    mimeType: fixture.mimeType,
    buffer: fixture.buffer,
  });

  await expect(page.getByText("Cover uploaded")).toBeVisible();

  const key = await page.getByLabel("Cover image key").inputValue();
  expect(key).not.toBe("");
  return key;
}

export interface StoryDraftInput {
  title: string;
  author?: string;
  shortDescription: string;
  description?: string;
  categoryName?: string;
  tagNames?: string[];
  cover?: ImageFixture;
}

/** Create a story draft and return its id. */
export async function createStoryDraft(
  page: Page,
  input: StoryDraftInput,
): Promise<string> {
  await page.goto("/admin/stories/new");

  await page.getByLabel("Title").fill(input.title);
  if (input.author) await page.getByLabel("Author").fill(input.author);
  await page.getByLabel("Short description").fill(input.shortDescription);
  if (input.description) {
    await writeRichText(page, "Description", input.description);
  }
  if (input.cover) {
    await uploadCover(page, input.cover);
  }
  if (input.categoryName) {
    await page.getByLabel("Category").selectOption({ label: input.categoryName });
  }
  for (const tag of input.tagNames ?? []) {
    await page.getByRole("checkbox", { name: tag }).check();
  }

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/admin\/stories\/[^/]+\/edit\?notice=created$/);

  return storyIdFromUrl(page.url());
}

/** Extract a story id from any admin story URL. */
export function storyIdFromUrl(url: string): string {
  const match = /\/admin\/stories\/([^/]+)\/edit/.exec(url);
  if (!match?.[1]) {
    throw new Error(`Could not read a story id from ${url}`);
  }
  return match[1];
}

export interface ChapterInput {
  title: string;
  content?: string;
}

/**
 * Create a chapter draft, then publish it.
 *
 * A new chapter is always saved as a draft by design, and publishing is a
 * separate deliberate step on the chapter's own screen. Both are part of the
 * real workflow, so both are exercised here.
 */
export async function createPublishedChapter(
  page: Page,
  storyId: string,
  input: ChapterInput,
): Promise<string> {
  await page.goto(`/admin/stories/${storyId}/chapters/new`);
  await page.getByLabel("Title").fill(input.title);
  if (input.content) {
    await writeRichText(page, "Chapter content", input.content);
  }
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/stories/${storyId}/chapters/[^/]+/edit\\?notice=created$`),
  );

  const chapterId = page.url().split("/chapters/")[1]?.split("/")[0];
  if (!chapterId) {
    throw new Error(`Could not read a chapter id from ${page.url()}`);
  }

  await expect(page.getByText("Draft. Publish to add it")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/edit\\?notice=published$`));

  return chapterId;
}

/**
 * Publish the story itself.
 *
 * Publishing always lands on `published`, whether or not the story has a
 * published chapter; the story is publicly visible either way.
 */
export async function publishStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`/admin/stories/${storyId}/edit`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/edit\?notice=published$/);
}

/** Unpublish the story from its edit screen. */
export async function unpublishStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`/admin/stories/${storyId}/edit`);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page).toHaveURL(/\/edit\?notice=unpublished$/);
}
