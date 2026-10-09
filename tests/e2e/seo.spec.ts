import sharp from "sharp";
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import {
  createPublishedChapter,
  createStoryDraft,
  publishStory,
  signIn,
} from "./support/admin";
import { coverPng } from "./support/images";

/**
 * SEO end to end.
 *
 * Every assertion reads the shipped HTML, robots.txt or sitemap.xml exactly as
 * a crawler would, against the deterministic seed. Admin journeys are driven
 * through the real interface so the metadata under test is what a publish
 * actually produces. `.agent/skills/seo/SKILL.md`.
 */
const baseURL = process.env.E2E_BASE_URL;

const STORY = "the-cartographers-debt";
const CHAPTER = "the-commission";

/**
 * Read a `<meta>` content value by content name.
 *
 * Open Graph tags are emitted with `property`, Twitter and robots tags with
 * `name`; this checks both and returns null immediately when the tag is
 * legitimately absent (a 404 page has no `og:url`, an indexable page has no
 * robots directive), rather than waiting for a locator that never matches.
 */
async function headContent(page: Page, key: string): Promise<string | null> {
  for (const attribute of ["property", "name"] as const) {
    const locator = page.locator(`meta[${attribute}="${key}"]`);
    if ((await locator.count()) > 0) {
      return locator.first().getAttribute("content");
    }
  }
  return null;
}

interface JsonLdNode {
  "@context"?: string;
  "@type": string;
  [key: string]: unknown;
}

async function jsonLdNodes(page: Page): Promise<JsonLdNode[]> {
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.textContent ?? ""),
    );
  return raw.map((text) => JSON.parse(text) as JsonLdNode);
}

const INDEXABLE_ROUTES: Array<{ path: string; canonical: string }> = [
  { path: "/", canonical: "/" },
  { path: "/stories", canonical: "/stories" },
  { path: "/categories", canonical: "/categories" },
  { path: "/about", canonical: "/about" },
  { path: `/stories/${STORY}`, canonical: `/stories/${STORY}` },
  {
    path: `/stories/${STORY}/chapter/${CHAPTER}`,
    canonical: `/stories/${STORY}/chapter/${CHAPTER}`,
  },
  {
    path: "/categories/frontier-chronicles",
    canonical: "/categories/frontier-chronicles",
  },
];

test.describe("seo", () => {
  test.skip(!baseURL, "E2E_BASE_URL is not set.");

  test("every indexable route emits one absolute canonical and a matching card", async ({
    page,
  }) => {
    for (const route of INDEXABLE_ROUTES) {
      await test.step(route.path, async () => {
        const response = await page.goto(route.path);
        expect(response?.status()).toBe(200);

        // Next's `resolveAbsoluteUrlWithPathname` emits `result.origin` — no
        // trailing slash — whenever a resolved canonical pathname is exactly
        // `/`, so the root canonical is the bare origin. The sitemap and
        // JSON-LD keep the trailing slash; the two forms are the same URL.
        const expectedCanonical =
          route.canonical === "/" ? baseURL : `${baseURL}${route.canonical}`;

        const canonicals = page.locator('link[rel="canonical"]');
        await expect(canonicals).toHaveCount(1);
        const href = await canonicals.getAttribute("href");
        expect(href).toBe(expectedCanonical);

        expect(await headContent(page, "og:url")).toBe(href);
        const image = await headContent(page, "og:image");
        expect(image?.startsWith(`${baseURL}/`) ?? false).toBe(true);
        expect(await headContent(page, "og:image:width")).toBe(
          "1200",
        );
        expect(await headContent(page, "og:image:height")).toBe(
          "630",
        );
        expect(
          await headContent(page, "twitter:card"),
        ).toBeTruthy();

        const robots = await headContent(page, "robots");
        expect(robots ?? "").not.toContain("noindex");
      });
    }
  });

  test("titles flow through the site-name template", async ({ page }) => {
    await page.goto("/");
    expect(await page.title()).toBe("Eagles Eye");

    await page.goto("/about");
    expect(await page.title()).toBe("About | Eagles Eye");

    await page.goto(`/stories/${STORY}`);
    expect(await page.title()).toBe("The Cartographer's Debt | Eagles Eye");
  });

  test("home advertises a WebSite node with a search action and nothing else", async ({
    page,
  }) => {
    await page.goto("/");
    const nodes = await jsonLdNodes(page);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.["@type"]).toBe("WebSite");
    expect(nodes[0]?.url).toBe(`${baseURL}/`);
    expect(nodes[0]?.name).toBe("Eagles Eye");
    expect(nodes[0]?.potentialAction).toEqual({
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseURL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    });
  });

  test("story and chapter pages emit the full structured-data set", async ({
    page,
  }) => {
    await page.goto(`/stories/${STORY}`);
    const storyCanonical = `${baseURL}/stories/${STORY}`;

    const storyNodes = await jsonLdNodes(page);
    expect(storyNodes.map((node) => node["@type"]).sort()).toEqual([
      "Article",
      "BreadcrumbList",
      "Story",
    ]);

    const article = storyNodes.find((node) => node["@type"] === "Article");
    expect(article?.url).toBe(storyCanonical);
    expect(article).not.toHaveProperty("author");
    expect(article?.publisher).toEqual({
      "@type": "Organization",
      name: "Eagles Eye",
      logo: `${baseURL}/logo.png`,
    });
    // The seed has no cover, so the default card image applies everywhere.
    expect(article?.image).toBe(`${baseURL}/og-default.png`);
    expect(await headContent(page, "og:image:alt")).toBe(
      "The Cartographer's Debt",
    );
    expect(await headContent(page, "twitter:card")).toBe("summary");

    const storyTrail = storyNodes.find(
      (node) => node["@type"] === "BreadcrumbList",
    );
    const crumbs = storyTrail?.itemListElement as Array<
      Record<string, unknown>
    >;
    expect(crumbs[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: `${baseURL}/`,
    });
    const lastCrumb = crumbs[crumbs.length - 1];
    expect(lastCrumb).toEqual({
      "@type": "ListItem",
      position: crumbs.length,
      name: "The Cartographer's Debt",
    });
    expect(lastCrumb).not.toHaveProperty("item");

    await page.goto(`/stories/${STORY}/chapter/${CHAPTER}`);
    const chapterNodes = await jsonLdNodes(page);
    const chapterArticle = chapterNodes.find(
      (node) => node["@type"] === "Article",
    );

    expect(chapterArticle).toBeDefined();
    expect(chapterArticle?.headline).toBe(
      "The Commission – The Cartographer's Debt",
    );
    expect(chapterArticle?.url).toBe(
      `${baseURL}/stories/${STORY}/chapter/${CHAPTER}`,
    );
    expect(chapterArticle?.wordCount).toBeGreaterThan(0);
    expect(chapterArticle?.isPartOf).toEqual({
      "@type": "Story",
      url: storyCanonical,
      name: "The Cartographer's Debt",
    });
    expect(
      chapterNodes.filter((node) => node["@type"] === "BreadcrumbList"),
    ).toHaveLength(1);
  });

  test("catalogue, category and about carry breadcrumbs; search carries none", async ({
    page,
  }) => {
    await page.goto("/stories");
    let nodes = await jsonLdNodes(page);
    expect(nodes.map((node) => node["@type"])).toEqual(["BreadcrumbList"]);

    await page.goto("/categories/frontier-chronicles");
    nodes = await jsonLdNodes(page);
    expect(nodes.map((node) => node["@type"]).sort()).toEqual([
      "BreadcrumbList",
      "CollectionPage",
    ]);
    const collection = nodes.find(
      (node) => node["@type"] === "CollectionPage",
    );
    expect(collection?.name).toBe("Frontier Chronicles");
    expect(collection?.url).toBe(`${baseURL}/categories/frontier-chronicles`);

    await page.goto("/about");
    nodes = await jsonLdNodes(page);
    expect(nodes.map((node) => node["@type"])).toEqual(["BreadcrumbList"]);

    await page.goto("/search?q=wind");
    nodes = await jsonLdNodes(page);
    expect(nodes).toHaveLength(0);
  });

  test("search stays canonical while filtered listings claim no canonical", async ({
    page,
  }) => {
    await page.goto("/search?q=wind");
    expect(await headContent(page, "robots")).toBe("noindex, follow");
    const searchCanonical = page.locator('link[rel="canonical"]');
    await expect(searchCanonical).toHaveCount(1);
    expect(await searchCanonical.getAttribute("href")).toBe(`${baseURL}/search`);

    await page.goto("/stories?q=wind");
    expect(await headContent(page, "robots")).toBe("noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test("cover cards request the crop and the route serves exactly 1200×630", async ({
    page,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Seo Covered Story",
      shortDescription:
        "A covered fixture whose social card must be the cropped rendition, not the raw upload.",
      cover: await coverPng(1200, 800, "card-cover.png"),
    });
    await createPublishedChapter(page, storyId, {
      title: "Opening Moves",
      content:
        "The survey began at dawn and did not stop until the tide had turned twice over the harbour wall.",
    });
    await publishStory(page, storyId);

    await page.goto("/stories/seo-covered-story");
    const ogImage = await headContent(page, "og:image");
    if (!ogImage) {
      throw new Error("expected an og:image on the covered story");
    }
    expect(ogImage.startsWith(`${baseURL}/api/images/`)).toBe(true);
    expect(ogImage.endsWith("?w=1200&h=630")).toBe(true);
    expect(await headContent(page, "twitter:card")).toBe(
      "summary_large_image",
    );

    const rendition = await page.request.get(ogImage);
    expect(rendition.status()).toBe(200);
    expect(rendition.headers()["content-type"]).toBe("image/jpeg");
    const card = await sharp(await rendition.body()).metadata();
    expect(card.format).toBe("jpeg");
    expect(card.width).toBe(1200);
    expect(card.height).toBe(630);

    // The same key without the size request still serves the stored cover,
    // and a size the route does not advertise is refused outright.
    const originalUrl = ogImage.replace("?w=1200&h=630", "");
    const original = await page.request.get(originalUrl);
    expect(original.status()).toBe(200);
    expect(original.headers()["content-type"]).toContain("image/webp");

    const rejected = await page.request.get(`${originalUrl}?w=64&h=64`);
    expect(rejected.status()).toBe(400);
  });

  test("a published story without chapters stays indexable", async ({
    page,
  }) => {
    await signIn(page);
    const storyId = await createStoryDraft(page, {
      title: "Seo No Chapters",
      shortDescription:
        "Published with no chapter yet: the story is still listed and indexable.",
    });
    await publishStory(page, storyId);

    await page.goto("/stories/seo-no-chapters");
    await expect(page).toHaveURL(/\/stories\/seo-no-chapters$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(await headContent(page, "robots") ?? "").not.toContain("noindex");

    const nodes = await jsonLdNodes(page);
    expect(
      nodes.filter(
        (node) => node["@type"] === "Story" || node["@type"] === "Article",
      ),
    ).toHaveLength(2);
    expect(
      nodes.some((node) => node["@type"] === "BreadcrumbList"),
    ).toBe(true);
  });

  test("a draft story 404s without leaking metadata", async ({ page }) => {
    const response = await page.goto("/stories/salt-and-cedar");
    expect(response?.status()).toBe(404);

    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    expect(await headContent(page, "og:url") ?? "").not.toContain(
      "salt-and-cedar",
    );
    expect(await page.title()).not.toContain("Salt and Cedar");

    const nodes = await jsonLdNodes(page);
    expect(
      nodes.filter(
        (node) => node["@type"] === "Story" || node["@type"] === "Article",
      ),
    ).toHaveLength(0);
  });

  test("robots.txt declares the three private surfaces, host and sitemap", async ({
    page,
  }) => {
    const response = await page.request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain("Disallow: /admin");
    expect(text).toContain("Disallow: /admin/login");
    expect(text).toContain("Disallow: /api/");
    expect(text.match(/Disallow:/g)).toHaveLength(3);
    expect(text).not.toContain("Disallow: /search");
    expect(text).toContain(`Host: ${baseURL}`);
    expect(text).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });

  test("sitemap.xml lists published content only", async ({ page }) => {
    const response = await page.request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1] ?? "",
    );

    expect(locs.length).toBeGreaterThan(0);
    expect(locs.every((loc) => loc.startsWith(`${baseURL}/`))).toBe(true);
    expect(locs.every((loc) => !loc.includes("?"))).toBe(true);

    expect(locs).toContain(`${baseURL}/`);
    expect(locs).toContain(`${baseURL}/stories`);
    expect(locs).toContain(`${baseURL}/stories/${STORY}`);
    expect(locs).toContain(
      `${baseURL}/stories/${STORY}/chapter/${CHAPTER}`,
    );
    expect(locs).toContain(`${baseURL}/categories/frontier-chronicles`);

    expect(locs.some((loc) => loc.includes("salt-and-cedar"))).toBe(false);
    expect(locs.some((loc) => loc.includes("the-lantern-keeper"))).toBe(false);
    expect(locs.some((loc) => loc.includes("/admin"))).toBe(false);
    expect(locs.some((loc) => loc.includes("/search"))).toBe(false);
    expect(locs.some((loc) => loc.includes("/api/"))).toBe(false);
  });
});
