import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBreadcrumbJsonLd,
  buildChapterJsonLd,
  buildCollectionPageJsonLd,
  buildStoryJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/seo/jsonld";
import { serializeJsonLd } from "@/components/seo/JsonLd";
import type { StoryJsonLdInput } from "@/lib/seo/jsonld";

const BASE = "https://seo.test";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface JsonLdNode {
  "@context": string;
  "@type": string;
  [key: string]: unknown;
}

function storyFixture(
  overrides: Partial<StoryJsonLdInput> = {},
): StoryJsonLdInput {
  return {
    title: "The Cartographer's Debt",
    seoDescription:
      "A surveyor maps a coast that refuses to hold still, and every chart she redraws erases the town she means to save.",
    slug: "the-cartographers-debt",
    coverImageUrl: "/api/images/cover.jpg",
    publishedAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-02-01T12:00:00.000Z",
    category: { name: "Frontier Chronicles" },
    tags: [{ name: "maps" }, { name: "tide" }],
    ...overrides,
  };
}

describe("buildWebSiteJsonLd", () => {
  it("emits a WebSite with a SearchAction targeting /search?q=", () => {
    const node = buildWebSiteJsonLd() as JsonLdNode;
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("WebSite");
    expect(node.name).toBe("Eagles Eye");
    expect(node.url).toBe("https://seo.test/");
    expect(node.potentialAction).toEqual({
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://seo.test/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    });
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers items from one and makes every url absolute", () => {
    const node = buildBreadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Stories", url: "/stories" },
      { name: "The Cartographer's Debt" },
    ]) as JsonLdNode & { itemListElement: Array<Record<string, unknown>> };

    expect(node["@type"]).toBe("BreadcrumbList");
    expect(node.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://seo.test/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Stories",
        item: "https://seo.test/stories",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "The Cartographer's Debt",
      },
    ]);
  });

  it("omits item on the current-page crumb instead of pointing at itself", () => {
    const node = buildBreadcrumbJsonLd([{ name: "Search" }, { name: "About" }]);
    const elements = (node as { itemListElement: Array<Record<string, unknown>> })
      .itemListElement;
    for (const element of elements) {
      expect(element).not.toHaveProperty("item");
    }
  });
});

describe("buildStoryJsonLd", () => {
  it("emits Story and Article nodes sharing one canonical url", () => {
    const nodes = buildStoryJsonLd(storyFixture()) as JsonLdNode[];
    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node["@type"])).toEqual(["Story", "Article"]);
    expect(nodes[0]?.url).toBe("https://seo.test/stories/the-cartographers-debt");
    expect(nodes[0]?.url).toBe(nodes[1]?.url);
    expect(nodes[0]?.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://seo.test/stories/the-cartographers-debt",
    });
  });

  it("never emits an author", () => {
    const nodes = buildStoryJsonLd(storyFixture()) as JsonLdNode[];
    for (const node of nodes) {
      expect(node).not.toHaveProperty("author");
    }
  });

  it("carries publisher, dates, category and keywords from published data", () => {
    const [node] = buildStoryJsonLd(storyFixture()) as JsonLdNode[];
    expect(node?.publisher).toEqual({
      "@type": "Organization",
      name: "Eagles Eye",
      logo: "https://seo.test/logo.png",
    });
    expect(node?.datePublished).toBe("2026-01-10T09:00:00.000Z");
    expect(node?.dateModified).toBe("2026-02-01T12:00:00.000Z");
    expect(node?.articleSection).toBe("Frontier Chronicles");
    expect(node?.keywords).toBe("maps, tide");
    expect(node?.image).toBe("https://seo.test/api/images/cover.jpg?w=1200&h=630");
  });

  it("drops both nodes only when the story has no description", () => {
    expect(buildStoryJsonLd(storyFixture({ seoDescription: "" }))).toEqual([]);
  });

  it("omits optional fields the story does not have", () => {
    const [node] = buildStoryJsonLd(
      storyFixture({
        coverImageUrl: null,
        publishedAt: null,
        category: null,
        tags: [],
      }),
    ) as JsonLdNode[];
    expect(node?.image).toBe("https://seo.test/og-default.png");
    expect(node).not.toHaveProperty("datePublished");
    expect(node?.dateModified).toBe("2026-02-01T12:00:00.000Z");
    expect(node).not.toHaveProperty("articleSection");
    expect(node).not.toHaveProperty("keywords");
  });
});

describe("buildChapterJsonLd", () => {
  const input = {
    story: {
      title: "The Cartographer's Debt",
      slug: "the-cartographers-debt",
      coverImageUrl: "/api/images/cover.jpg",
    },
    chapter: {
      title: "The Commission",
      slug: "the-commission",
      publishedAt: "2026-01-10T09:00:00.000Z",
      updatedAt: "2026-02-01T12:00:00.000Z",
    },
    description:
      "The commission arrives by courier, sealed with a wax stamp the coast has not used in thirty years.",
    wordCount: 1840,
  };

  it("emits an Article whose headline reads out of context", () => {
    const node = buildChapterJsonLd(input) as JsonLdNode;
    expect(node["@type"]).toBe("Article");
    expect(node.headline).toBe("The Commission – The Cartographer's Debt");
    expect(node.url).toBe(
      "https://seo.test/stories/the-cartographers-debt/chapter/the-commission",
    );
    expect(node.wordCount).toBe(1840);
    expect(node.image).toBe("https://seo.test/api/images/cover.jpg?w=1200&h=630");
    expect(node).not.toHaveProperty("author");
  });

  it("links back to the story through isPartOf", () => {
    const node = buildChapterJsonLd(input) as JsonLdNode;
    expect(node.isPartOf).toEqual({
      "@type": "Story",
      url: "https://seo.test/stories/the-cartographers-debt",
      name: "The Cartographer's Debt",
    });
  });

  it("keeps dates as ISO strings and drops a missing published date", () => {
    const node = buildChapterJsonLd({
      ...input,
      chapter: { ...input.chapter, publishedAt: null },
    }) as JsonLdNode;
    expect(node.dateModified).toBe("2026-02-01T12:00:00.000Z");
    expect(node).not.toHaveProperty("datePublished");
  });

  it("clamps an over-long headline on a word boundary", () => {
    const node = buildChapterJsonLd({
      ...input,
      chapter: {
        ...input.chapter,
        title:
          "A title long enough that the story name pushes it well past the limit",
      },
    }) as JsonLdNode;
    const headline = String(node.headline);
    expect(headline.length).toBeLessThanOrEqual(60);
    expect(headline.endsWith("…")).toBe(true);
  });

  it("returns null when the body yields no description", () => {
    expect(buildChapterJsonLd({ ...input, description: "" })).toBeNull();
  });
});

describe("buildCollectionPageJsonLd", () => {
  it("names the category with an absolute url and optional description", () => {
    const node = buildCollectionPageJsonLd({
      name: "Harbour Lights",
      slug: "harbour-lights",
      description: "Stories anchored in port towns and their weather.",
    }) as JsonLdNode;
    expect(node["@type"]).toBe("CollectionPage");
    expect(node.name).toBe("Harbour Lights");
    expect(node.url).toBe("https://seo.test/categories/harbour-lights");
    expect(node.description).toBe("Stories anchored in port towns and their weather.");
  });

  it("omits the description key when the category has none", () => {
    const node = buildCollectionPageJsonLd({
      name: "Harbour Lights",
      slug: "harbour-lights",
      description: null,
    });
    expect(node).not.toHaveProperty("description");
  });
});

describe("serializeJsonLd", () => {
  it("escapes every angle bracket so a value cannot break out of the script", () => {
    const output = serializeJsonLd({ note: "</script><script>alert(1)</script>" });
    expect(output).not.toMatch(/<\/script/i);
    expect(output).toContain("\\u003c/script>");
  });

  it("round-trips as JSON", () => {
    const data = { "@type": "WebSite", name: "Eagles Eye" };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
