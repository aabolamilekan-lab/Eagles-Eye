import type { Page } from "@playwright/test";

import {
  createCategory,
  createPublishedChapter,
  createStoryDraft,
  injectRawHtml,
  publishStory,
  signIn,
} from "./support/admin";
import { E2E_ORIGIN } from "./support/environment";
import { expect, test } from "./support/fixtures";
import { coverPng, notAnImage, oversized, svgDisguisedAsPng } from "./support/images";
import type { ImageFixture } from "./support/images";

/**
 * Failure and security coverage.
 *
 * Each test states a rule from AGENTS.md and drives the shipped interface until
 * that rule either holds or fails. Nothing here reaches around the application:
 * forms are submitted, requests are sent with real cookies and origins, and the
 * assertions are on what a reader or an attacker would actually receive.
 */
/**
 * The sign-in form's error, scoped to it.
 *
 * Next.js keeps a persistent route announcer with `role="alert"` in the DOM, so
 * an unscoped role query resolves to two elements. Filtering on the text the
 * form actually owns selects the one under test.
 */
function loginError(page: Page) {
  return page
    .getByRole("alert")
    .filter({ hasText: /Invalid email or password|Too many attempts|Sign in failed/ });
}

/** Send a cover upload through the API from a possibly signed-in page. */
function postUpload(page: Page, file: ImageFixture, origin: string | null = E2E_ORIGIN) {
  return page.request.post("/api/admin/uploads", {
    headers: origin ? { origin } : {},
    multipart: {
      file: { name: file.name, mimeType: file.mimeType, buffer: file.buffer },
    },
  });
}

test.describe("authentication and authorization", () => {
  test("an unknown account and a wrong password are indistinguishable", async ({
    page,
  }) => {
    await page.goto("/admin/login");

    await page.getByLabel("Email").fill("definitely-not-a-user@example.com");
    await page.getByLabel("Password").fill("a-perfectly-ordinary-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(loginError(page)).toContainText("Invalid email or password.");
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.getByLabel("Email").fill("definitely-not-a-user@example.com");
    await page.getByLabel("Password").fill("a-different-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(loginError(page)).toContainText("Invalid email or password.");

    // No session was issued, so nothing can be reused.
    expect((await page.context().cookies()).filter((c) => c.name.includes("session"))).toHaveLength(0);
  });

  test("repeated failures from one client are refused", async ({ page }) => {
    await page.goto("/admin/login");

    /**
     * One failed attempt, waited on properly.
     *
     * The error alert is present from the previous attempt onwards, so asserting
     * only on its visibility would let the loop run ahead of the server. Waiting
     * for this attempt's own action response makes the count real.
     */
    const attempt = async () => {
      await page.getByLabel("Email").fill("definitely-not-a-user@example.com");
      await page.getByLabel("Password").fill("wrong-password");
      const [response] = await Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.request().method() === "POST" &&
            candidate.url().includes("/admin/login"),
        ),
        page.getByRole("button", { name: "Sign in" }).click(),
      ]);
      expect(response.status()).toBe(200);
      await expect(loginError(page)).toBeVisible();
    };

    for (let i = 0; i < 5; i += 1) {
      await attempt();
    }

    // The sixth attempt never reaches the credential check.
    await attempt();
    await expect(loginError(page)).toContainText("Too many attempts. Try again later.");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("every admin route sends an anonymous visitor to sign in", async ({ page }) => {
    for (const path of [
      "/admin",
      "/admin/stories",
      "/admin/stories/new",
      "/admin/categories",
      "/admin/tags",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login$/);
    }
  });

  test("a signed-out session cannot reach protected resources", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);

    // Sign out revokes server-side; it does not merely clear the cookie.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    const upload = await page.request.post("/api/admin/uploads", {
      headers: { origin: E2E_ORIGIN },
      multipart: {
        file: {
          name: "cover.png",
          mimeType: "image/png",
          buffer: (await coverPng()).buffer,
        },
      },
    });
    expect(upload.status()).toBe(401);

    // The same visitor still cannot browse an admin page afterwards.
    await page.goto("/admin/stories");
    await expect(page).toHaveURL(/\/admin\/login$/);

    expect(
      (await page.context().cookies()).filter((c) => c.name.includes("session")),
    ).toHaveLength(0);
  });
});

test.describe("input validation", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("whitespace-only titles are rejected by the server", async ({ page }) => {
    // A whitespace value satisfies the browser's `required` attribute, so this
    // exercises the server-side rule rather than the client affordance.
    await page.goto("/admin/stories/new");
    await page.getByLabel("Title").fill("     ");
    await page.getByLabel("Short description").fill("A story that should not exist.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("A title is required.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/stories\/new$/);

    await page.goto("/admin/categories/new");
    await page.getByLabel("Name").fill("   ");
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByText("A name is required.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/categories\/new$/);
  });

  test("a chapter cannot reuse a sibling's web address", async ({ page }) => {
    const storyId = await createStoryDraft(page, {
      title: "Winter Ledger",
      shortDescription: "Two chapters sharing one address would be ambiguous.",
    });
    await createPublishedChapter(page, storyId, { title: "Frost", content: "The pipe froze." });
    await createPublishedChapter(page, storyId, { title: "Thaw", content: "Then it thawed." });

    // Both chapters take their title-derived slug by default; point the second
    // at the first one's address explicitly. The text role excludes the
    // "Confirm changing this chapter's web address" checkbox, whose label
    // contains the same words.
    await page.getByRole("textbox", { name: "Web address" }).fill("frost");
    await page
      .getByRole("checkbox", { name: "Confirm changing this chapter's web address" })
      .check();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(
      page.getByText("That web address is already in use in this story."),
    ).toBeVisible();
  });

  test("a category cannot take an existing web address", async ({ page }) => {
    await createCategory(page, "Harbour Myths");

    await page.goto("/admin/categories/new");
    await page.getByLabel("Name").fill("A different name entirely");
    await page.getByLabel("Web address").fill("harbour-myths");
    await page.getByRole("button", { name: "Create category" }).click();

    await expect(page.getByText("That web address is already in use.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/categories\/new$/);
  });
});

test.describe("upload boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the upload endpoint refuses requests it did not originate here", async ({
    page,
    browser,
  }) => {
    const file = await coverPng();

    // No session at all: authentication is checked before anything else.
    const anonymous = await browser.newContext({ baseURL: E2E_ORIGIN });
    const anonymousUpload = await anonymous.request.post("/api/admin/uploads", {
      headers: { origin: E2E_ORIGIN },
      multipart: {
        file: { name: file.name, mimeType: file.mimeType, buffer: file.buffer },
      },
    });
    expect(anonymousUpload.status()).toBe(401);
    await anonymous.close();

    // A forged origin is refused even with a valid session.
    const forged = await postUpload(page, file, "https://attacker.example");
    expect(forged.status()).toBe(403);
    expect((await forged.json()).error).toBe("Request origin is not allowed.");

    // Missing origin is treated the same way as a forged one.
    const noOrigin = await postUpload(page, file, null);
    expect(noOrigin.status()).toBe(403);

    // Not multipart at all.
    const notMultipart = await page.request.post("/api/admin/uploads", {
      headers: { origin: E2E_ORIGIN, "content-type": "application/json" },
      data: { file: "cover.png" },
    });
    expect(notMultipart.status()).toBe(415);
  });

  test("the upload endpoint accepts only well-formed images", async ({ page }) => {
    const png = await coverPng();

    // A format outside the allowlist.
    const unsupported = await postUpload(page, {
      name: "cover.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    expect(unsupported.status()).toBe(415);
    expect((await unsupported.json()).error).toBe(
      "Only JPEG, PNG and WebP images are accepted.",
    );

    // Declared PNG, JPEG extension: the two disagree.
    const mismatched = await postUpload(page, { ...png, name: "cover.jpg" });
    expect(mismatched.status()).toBe(415);
    expect((await mismatched.json()).error).toBe(
      "The file extension does not match the image type.",
    );

    // Text renamed to .png: the declared type and extension agree, the bytes do not.
    const renamed = await postUpload(page, notAnImage());
    expect(renamed.status()).toBe(415);
    expect((await renamed.json()).error).toBe(
      "The file is not a valid image of its declared type.",
    );

    // An SVG with an embedded script, mislabelled as a PNG.
    const svg = await postUpload(page, svgDisguisedAsPng());
    expect(svg.status()).toBe(415);

    // Over the size ceiling.
    const tooBig = await postUpload(page, oversized());
    expect(tooBig.status()).toBe(413);
    expect((await tooBig.json()).error).toBe(
      "The image is larger than the allowed size.",
    );

    // A genuine image still goes through, so the checks are not vacuous.
    const accepted = await postUpload(page, png);
    expect(accepted.status()).toBe(200);
    const body = await accepted.json();
    expect(body.ok).toBe(true);
    expect(body.key).toMatch(/^covers\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/);
  });
});

test.describe("public visibility", () => {
  test("a draft story with a published chapter is still invisible", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Draft Night",
      shortDescription: "Published chapters do not publish their story.",
    });
    await createPublishedChapter(page, storyId, {
      title: "Rehearsal",
      content: "The stage stays dark until the story itself is published.",
    });

    // The chapter is published; the story is not.
    const reader = await browser.newContext({ baseURL: E2E_ORIGIN });
    const view = await reader.newPage();
    const detail = await view.goto("/stories/draft-night");
    expect(detail?.status()).toBe(404);

    const chapter = await view.goto("/stories/draft-night/chapter/rehearsal");
    expect(chapter?.status()).toBe(404);

    await view.goto("/stories?q=Draft%20Night");
    // Matched by address, not by name: the catalogue also renders the active
    // query as a removable chip, whose label quotes the search term.
    await expect(view.locator('a[href="/stories/draft-night"]')).toHaveCount(0);
    await expect(view.locator('a[href^="/stories/draft-night/"]')).toHaveCount(0);
    await reader.close();
  });

  test("an unpublished chapter disappears from the reader", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Two Harbours",
      shortDescription: "Only published chapters belong in the table of contents.",
    });
    await createPublishedChapter(page, storyId, {
      title: "North",
      content: "Cold water and colder coffee.",
    });
    const secondId = await createPublishedChapter(page, storyId, {
      title: "South",
      content: "Warm water and no coffee at all.",
    });
    await publishStory(page, storyId);

    // Unpublish the second chapter only.
    await page.goto(`/admin/stories/${storyId}/chapters/${secondId}/edit`);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page).toHaveURL(/\/edit\?notice=unpublished$/);

    const reader = await browser.newContext({ baseURL: E2E_ORIGIN });
    const view = await reader.newPage();
    const detail = await view.goto("/stories/two-harbours");
    expect(detail?.status()).toBe(200);
    await expect(view.locator('ol a[href^="/stories/two-harbours/chapter/"]')).toHaveCount(1);
    await expect(view.locator('ol a[href^="/stories/two-harbours/chapter/"]').first()).toContainText("North");

    const hidden = await view.goto("/stories/two-harbours/chapter/south");
    expect(hidden?.status()).toBe(404);
    await reader.close();
  });
});

test.describe("content safety and integrity", () => {
  test("hostile markup in rich text never reaches a reader as executable HTML", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Salt Ledger",
      shortDescription: "Rich text is untrusted input regardless of who typed it.",
    });

    const payload =
      "A safe opening line." +
      '<script>window.__pwned = true;</script>' +
      '<img src="x" onerror="window.__pwned = true">' +
      '<a href="javascript:window.__pwned=true">bad link</a>' +
      '<a href="https://example.test" onclick="window.__pwned = true">cloned</a>' +
      '<p onmouseover="window.__pwned = true">hover text</p>' +
      "<iframe src=\"https://example.test\"></iframe>" +
      "<svg><script>window.__pwned = true</script></svg>";

    await page.goto(`/admin/stories/${storyId}/edit`);
    await injectRawHtml(page, "Description", payload);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/edit\?notice=saved$/);

    const chapterId = await createPublishedChapter(page, storyId, {
      title: "Ledger",
      content: "A clean opening line.",
    });
    await injectRawHtml(page, "Chapter content", payload);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/edit\?notice=saved$/);
    expect(chapterId).not.toBe("");

    // The story itself is published last: it needs a published chapter first.
    await publishStory(page, storyId);

    const reader = await browser.newContext({ baseURL: E2E_ORIGIN });
    const view = await reader.newPage();
    await view.addInitScript(() => {
      window.alert = () => {
        throw new Error("dialog fired");
      };
    });

    for (const url of ["/stories/salt-ledger", "/stories/salt-ledger/chapter/ledger"]) {
      const response = await view.goto(url);
      expect(response?.status()).toBe(200);

      // Nothing executed: no script ran and no dialog opened during load.
      expect(await view.evaluate(() => (window as { __pwned?: boolean }).__pwned)).toBeUndefined();

      const rendered = view.locator(".prose");
      await expect(rendered.first()).toContainText("A safe opening line.");
      await expect(view.locator(".prose script")).toHaveCount(0);
      await expect(view.locator(".prose iframe")).toHaveCount(0);
      await expect(
        view.locator(
          ".prose [onerror], .prose [onclick], .prose [onmouseover], .prose [onload]",
        ),
      ).toHaveCount(0);

      const javascriptLinks = await view
        .locator(".prose a[href]")
        .evaluateAll((links) =>
          links
            .map((a) => a.getAttribute("href") ?? "")
            .filter((href) => /^\s*(javascript|data|vbscript):/i.test(href)),
        );
      expect(javascriptLinks).toEqual([]);
    }
    await reader.close();
  });

  test("a reorder payload with a duplicated chapter is refused", async ({ page }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Tide Order",
      shortDescription: "Order is written in one transaction, or not at all.",
    });
    for (const title of ["Alpha", "Bravo", "Charlie"]) {
      await createPublishedChapter(page, storyId, { title, content: `${title} body.` });
    }

    await page.goto(`/admin/stories/${storyId}/chapters`);

    // Make the form dirty through the real control, then corrupt the payload.
    await page.getByRole("button", { name: "Move Alpha down" }).click();
    await expect(page.getByRole("button", { name: "Save order" })).toBeEnabled();
    // The optimistic reorder has rendered, so the hidden inputs follow it.
    const rows = page.locator('form:has(input[name="order"]) > ol > li');
    await expect(rows.nth(0)).toContainText("Bravo");

    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="hidden"][name="order"]'));
      const first = inputs[0];
      if (inputs.length < 2 || !(first instanceof HTMLInputElement)) return;
      const second = inputs[1];
      if (!(second instanceof HTMLInputElement)) return;
      second.value = first.value;
    });

    await page.getByRole("button", { name: "Save order" }).click();
    await expect(page.getByText("The chapter list changed. Reload and try again.")).toBeVisible();

    // Nothing was written: the stored order still renders 1, 2, 3.
    await page.reload();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Alpha");
    await expect(rows.nth(1)).toContainText("Bravo");
    await expect(rows.nth(2)).toContainText("Charlie");
  });
});
