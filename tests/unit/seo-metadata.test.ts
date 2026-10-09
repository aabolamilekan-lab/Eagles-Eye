import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import {
  buildPageMetadata,
  buildStoryPageMetadata,
  clampDescription,
  clampTitle,
  robotsForNonIndexable,
} from "@/lib/seo/metadata";
import type { PublishedStoryDetail } from "@/lib/queries/public/story-detail";

const BASE = "https://seo.test";

/** The object shape `buildPageMetadata` returns inside `openGraph`. */
interface OgShape {
  siteName?: string;
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  locale?: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  publishedTime?: string;
  modifiedTime?: string;
}

/** The object shape `buildPageMetadata` returns inside `twitter`. */
interface TwitterShape {
  card?: string;
  title?: string;
  description?: string;
  images?: Array<{ url: string; alt?: string }>;
}

function og(metadata: Metadata): OgShape {
  return metadata.openGraph as OgShape;
}

function twitter(metadata: Metadata): TwitterShape {
  return metadata.twitter as TwitterShape;
}

function storyFixture(
  overrides: Partial<PublishedStoryDetail> = {},
): PublishedStoryDetail {
  return {
    id: "story-1",
    slug: "the-cartographers-debt",
    title: "The Cartographer's Debt",
    author: "N. Okonkwo",
    shortDescription: "A surveyor maps a coast that refuses to hold still.",
    description: "<p>Sanitized body.</p>",
    coverImageUrl: "/api/images/cover.jpg",
    coverAlt: "The Cartographer's Debt",
    views: 12,
    publishedAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-02-01T12:00:00.000Z",
    seoDescription:
      "A surveyor maps a coast that refuses to hold still, and every chart she redraws erases the town she means to save.",
    category: { name: "Frontier Chronicles", slug: "frontier-chronicles" },
    tags: [{ name: "maps", slug: "maps" }],
    chapters: [],
    chapterCount: 0,
    hasPublishedChapters: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const LONG_TITLE =
  "alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november oscar papa quebec";
const LONG_DESCRIPTION =
  "A surveyor maps a coast that refuses to hold still, and every chart she redraws erases the town she means to save before the tide finishes what the survey started.";

describe("clampTitle", () => {
  it("leaves a short title untouched", () => {
    expect(clampTitle("Short works")).toBe("Short works");
  });

  it("normalizes internal whitespace", () => {
    expect(clampTitle("two \n  spaces")).toBe("two spaces");
  });

  it("clamps on a word boundary within 60 characters", () => {
    const result = clampTitle(LONG_TITLE);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(60);
    const inputWords = LONG_TITLE.split(" ");
    const keptWords = result.slice(0, -1).trim().split(" ");
    expect(keptWords.every((word) => inputWords.includes(word))).toBe(true);
  });
});

describe("clampDescription", () => {
  it("leaves a short description untouched", () => {
    expect(clampDescription("Short works.")).toBe("Short works.");
  });

  it("clamps on a word boundary within 155 characters", () => {
    const result = clampDescription(LONG_DESCRIPTION);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(155);
    const inputWords = LONG_DESCRIPTION.split(" ");
    const keptWords = result.slice(0, -1).trim().split(" ");
    expect(keptWords.every((word) => inputWords.includes(word))).toBe(true);
  });
});

describe("robotsForNonIndexable", () => {
  it("noindexes but keeps following", () => {
    expect(robotsForNonIndexable()).toEqual({ index: false, follow: true });
  });
});

describe("buildPageMetadata", () => {
  it("emits an absolute canonical that matches og:url", () => {
    const metadata = buildPageMetadata({ title: "Stories", path: "/stories" });
    expect(metadata.alternates?.canonical).toBe("https://seo.test/stories");
    expect(og(metadata).url).toBe("https://seo.test/stories");
  });

  it("clamps the description and applies the leaf title without the template", () => {
    const metadata = buildPageMetadata({
      title: LONG_TITLE,
      description: LONG_DESCRIPTION,
      path: "/stories",
    });
    expect(metadata.title).toBe(clampTitle(LONG_TITLE));
    expect(metadata.description).toBe(clampDescription(LONG_DESCRIPTION));
    // The card carries the display title with the site-name suffix, because
    // cards do not render through the root layout's title template.
    expect(og(metadata).title).toBe(`${clampTitle(LONG_TITLE)} | Eagles Eye`);
    expect(twitter(metadata).title).toBe(
      `${clampTitle(LONG_TITLE)} | Eagles Eye`,
    );
  });

  it("omits the title key for the home page and an empty description key", () => {
    const home = buildPageMetadata({ path: "/" });
    expect(home).not.toHaveProperty("title");

    const blank = buildPageMetadata({ title: "About", description: "  ", path: "/about" });
    expect(blank).not.toHaveProperty("description");
    expect(og(blank)).not.toHaveProperty("description");
    expect(twitter(blank)).not.toHaveProperty("description");
  });

  it("adds a noindex robots directive only when asked", () => {
    const indexable = buildPageMetadata({ title: "Stories", path: "/stories" });
    expect(indexable).not.toHaveProperty("robots");

    const filtered = buildPageMetadata({
      title: "Stories",
      path: "/stories",
      noindex: true,
    });
    expect(filtered.robots).toEqual({ index: false, follow: true });
  });

  it("drops the canonical entirely when canonical is false, keeping og:url on the path", () => {
    const metadata = buildPageMetadata({
      title: "Stories",
      path: "/stories",
      canonical: false,
      noindex: true,
    });
    expect(metadata).not.toHaveProperty("alternates");
    expect(og(metadata).url).toBe("https://seo.test/stories");
  });

  it("honours a canonical override for both canonical and og:url", () => {
    const metadata = buildPageMetadata({
      title: "Stories",
      path: "/stories?page=2",
      canonical: "/stories",
    });
    expect(metadata.alternates?.canonical).toBe("https://seo.test/stories");
    expect(og(metadata).url).toBe("https://seo.test/stories");
  });

  it("defaults to a website card with the 1200×630 default image", () => {
    const metadata = buildPageMetadata({ title: "Stories", path: "/stories" });
    const openGraph = og(metadata);
    expect(openGraph.type).toBe("website");
    expect(openGraph.siteName).toBe("Eagles Eye");
    expect(openGraph.locale).toBe("en_US");
    expect(openGraph).not.toHaveProperty("publishedTime");
    expect(openGraph.images).toEqual([
      {
        url: "https://seo.test/og-default.png",
        width: 1200,
        height: 630,
        alt: "Stories | Eagles Eye",
      },
    ]);
    expect(twitter(metadata).card).toBe("summary");
    expect(twitter(metadata).images).toEqual([
      { url: "https://seo.test/og-default.png", alt: "Stories | Eagles Eye" },
    ]);
  });

  it("requests the cropped card rendition for a cover and switches to a large image card", () => {
    const metadata = buildPageMetadata({
      title: "Stories",
      path: "/stories",
      image: "/api/images/cover.jpg",
      imageAlt: "Cover",
    });
    expect(og(metadata).images?.[0]?.url).toBe(
      "https://seo.test/api/images/cover.jpg?w=1200&h=630",
    );
    expect(twitter(metadata).card).toBe("summary_large_image");
    expect(twitter(metadata).images?.[0]).toEqual({
      url: "https://seo.test/api/images/cover.jpg?w=1200&h=630",
      alt: "Cover",
    });
  });

  it("renders article dates as ISO strings only on the article variant", () => {
    const publishedAt = new Date("2026-01-10T09:00:00.000Z");
    const metadata = buildPageMetadata({
      title: "Story",
      path: "/stories/x",
      type: "article",
      publishedTime: publishedAt,
      modifiedTime: "2026-02-01T12:00:00.000Z",
    });
    expect(og(metadata).type).toBe("article");
    expect(og(metadata).publishedTime).toBe("2026-01-10T09:00:00.000Z");
    expect(og(metadata).modifiedTime).toBe("2026-02-01T12:00:00.000Z");
  });
});

describe("buildStoryPageMetadata", () => {
  it("produces an indexable article metadata for a published story", () => {
    const metadata = buildStoryPageMetadata(storyFixture());
    expect(metadata.alternates?.canonical).toBe(
      "https://seo.test/stories/the-cartographers-debt",
    );
    expect(metadata).not.toHaveProperty("robots");
    expect(og(metadata).type).toBe("article");
    expect(og(metadata).publishedTime).toBe("2026-01-10T09:00:00.000Z");
    expect(og(metadata).modifiedTime).toBe("2026-02-01T12:00:00.000Z");
    expect(og(metadata).images?.[0]?.alt).toBe("The Cartographer's Debt");
    expect(twitter(metadata).card).toBe("summary_large_image");
    expect(metadata.description).toBe(clampDescription(storyFixture().seoDescription));
  });

  it("stays indexable with a canonical even when no chapter is published", () => {
    const metadata = buildStoryPageMetadata(
      storyFixture({ hasPublishedChapters: false }),
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://seo.test/stories/the-cartographers-debt",
    );
    expect(metadata).not.toHaveProperty("robots");
    expect(og(metadata).url).toBe(
      "https://seo.test/stories/the-cartographers-debt",
    );
    expect(twitter(metadata).card).toBe("summary_large_image");
  });

  it("falls back to the default card image when the story has no cover", () => {
    const metadata = buildStoryPageMetadata(storyFixture({ coverImageUrl: null }));
    expect(og(metadata).images?.[0]?.url).toBe("https://seo.test/og-default.png");
    expect(twitter(metadata).card).toBe("summary");
  });
});
