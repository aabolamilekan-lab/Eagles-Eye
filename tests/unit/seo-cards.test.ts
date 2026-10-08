import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { buildTwitter } from "@/lib/seo/twitter";
import { ogImageUrl } from "@/lib/seo/cover-url";

const BASE = "https://seo.test";

/** Next's openGraph/twitter are discriminated unions; this is the readable shape. */
interface OgShape {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  locale?: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  publishedTime?: string;
  modifiedTime?: string;
}

interface TwitterShape {
  card?: string;
  title?: string;
  description?: string;
  images?: Array<{ url: string; alt?: string }>;
}

function og(
  value: ReturnType<typeof buildOpenGraph>,
): OgShape {
  return value as OgShape;
}

function tw(value: ReturnType<typeof buildTwitter>): TwitterShape {
  return value as TwitterShape;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ogImageUrl", () => {
  it("requests the 1200×630 rendition of a cover route", () => {
    expect(ogImageUrl("/api/images/cover.jpg")).toBe(
      "/api/images/cover.jpg?w=1200&h=630",
    );
  });

  it("leaves an already-parameterized url alone", () => {
    expect(ogImageUrl("/api/images/cover.jpg?w=80")).toBe(
      "/api/images/cover.jpg?w=80",
    );
  });

  it("leaves the default card image and non-cover paths alone", () => {
    expect(ogImageUrl("/og-default.png")).toBe("/og-default.png");
    expect(ogImageUrl("/uploads/x.jpg")).toBe("/uploads/x.jpg");
    expect(ogImageUrl("https://cdn.example/cover.jpg")).toBe(
      "https://cdn.example/cover.jpg",
    );
  });
});

describe("buildOpenGraph", () => {
  it("builds a website card with an absolute url and a sized image", () => {
    const openGraph = og(buildOpenGraph({ title: "Stories", path: "/stories" }));
    expect(openGraph.type).toBe("website");
    expect(openGraph.title).toBe("Stories");
    expect(openGraph.url).toBe("https://seo.test/stories");
    expect(openGraph.locale).toBe("en_US");
    expect(openGraph.images).toEqual([
      {
        url: "https://seo.test/og-default.png",
        width: 1200,
        height: 630,
        alt: "Stories",
      },
    ]);
  });

  it("omits the description key when none is supplied", () => {
    const openGraph = buildOpenGraph({ title: "Stories", path: "/stories" });
    expect(openGraph).not.toHaveProperty("description");
  });

  it("crops a cover to the card rendition and defaults the alt to the title", () => {
    const openGraph = og(
      buildOpenGraph({
        title: "Story",
        path: "/stories/x",
        image: "/api/images/cover.jpg",
      }),
    );
    expect(openGraph.images?.[0]).toEqual({
      url: "https://seo.test/api/images/cover.jpg?w=1200&h=630",
      width: 1200,
      height: 630,
      alt: "Story",
    });
  });

  it("adds ISO article dates only on the article variant", () => {
    const article = og(
      buildOpenGraph({
        title: "Story",
        path: "/stories/x",
        type: "article",
        publishedTime: new Date("2026-01-10T09:00:00.000Z"),
        modifiedTime: "2026-02-01T12:00:00.000Z",
      }),
    );
    expect(article.type).toBe("article");
    expect(article.publishedTime).toBe("2026-01-10T09:00:00.000Z");
    expect(article.modifiedTime).toBe("2026-02-01T12:00:00.000Z");

    const website = buildOpenGraph({
      title: "Story",
      path: "/stories/x",
      publishedTime: new Date("2026-01-10T09:00:00.000Z"),
    });
    expect(website).not.toHaveProperty("publishedTime");
  });
});

describe("buildTwitter", () => {
  it("wears a summary card with the default image when there is no cover", () => {
    const twitter = tw(buildTwitter({ title: "Stories" }));
    expect(twitter.card).toBe("summary");
    expect(twitter.title).toBe("Stories");
    expect(twitter.images).toEqual([
      { url: "https://seo.test/og-default.png", alt: "Stories" },
    ]);
  });

  it("wears a large-image card when a cover exists", () => {
    const twitter = tw(
      buildTwitter({
        title: "Story",
        image: "/api/images/cover.jpg",
        imageAlt: "Cover",
      }),
    );
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.images).toEqual([
      {
        url: "https://seo.test/api/images/cover.jpg?w=1200&h=630",
        alt: "Cover",
      },
    ]);
  });

  it("omits the description key when none is supplied and never invents handles", () => {
    const twitter = buildTwitter({ title: "Stories" });
    expect(twitter).not.toHaveProperty("description");
    expect(twitter).not.toHaveProperty("site");
    expect(twitter).not.toHaveProperty("creator");
  });
});

describe("metadata composition", () => {
  it("keeps the openGraph type compatible with next's Metadata contract", () => {
    const openGraph = buildOpenGraph({ title: "Stories", path: "/stories" });
    const metadata: Metadata = { openGraph };
    expect(metadata.openGraph).toBe(openGraph);
  });
});
