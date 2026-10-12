import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryCard, FeaturedStory, type StoryCardData } from "@/components/stories/StoryCard";
import { ShareActions } from "@/components/stories/ShareActions";
import { toStoryCard, type StoryCardRow } from "@/lib/queries/public/story-card";

describe("Public Components and Data Mapping", () => {
  describe("toStoryCard", () => {
    it("maps syndicated source name when importedArticles has source", () => {
      const mockRow: StoryCardRow = {
        slug: "syndicated-story",
        title: "Federal Ministry Announces New Policy",
        author: "Staff Reporter",
        shortDescription: "A comprehensive overview of new guidelines.",
        coverImage: null,
        publishedAt: new Date("2026-10-12T10:00:00Z"),
        category: { name: "Nigerian Affairs", slug: "nigerian-affairs" },
        importedArticles: [
          {
            source: {
              name: "Premium Times",
            },
          },
        ],
        _count: {
          chapters: 0,
        },
      };

      const card = toStoryCard(mockRow);
      expect(card.sourceName).toBe("Premium Times");
      expect(card.title).toBe("Federal Ministry Announces New Policy");
      expect(card.category?.name).toBe("Nigerian Affairs");
      expect(card.publishedAt).toBe("2026-10-12T10:00:00.000Z");
    });

    it("leaves sourceName null for original stories without imported articles", () => {
      const mockRow: StoryCardRow = {
        slug: "original-fiction",
        title: "The Quiet Harbour",
        author: "Jane Doe",
        shortDescription: "A fictional narrative.",
        coverImage: null,
        publishedAt: new Date("2026-10-10T12:00:00Z"),
        category: { name: "Fiction", slug: "fiction" },
        importedArticles: [],
        _count: {
          chapters: 3,
        },
      };

      const card = toStoryCard(mockRow);
      expect(card.sourceName).toBeNull();
      expect(card.chapterCount).toBe(3);
    });
  });

  describe("StoryCard rendering", () => {
    const testStory: StoryCardData = {
      slug: "tech-breakthrough",
      title: "Breakthrough in Clean Energy Transmission",
      author: "Alex Morgan",
      shortDescription: "Engineers develop high-capacity grid infrastructure.",
      coverImageUrl: null,
      coverAlt: null,
      category: { name: "Technology", slug: "technology-science" },
      chapterCount: 1,
      readingMinutes: 4,
      publishedAt: "2026-10-11T14:00:00Z",
      sourceName: "Tech News Daily",
    };

    it("renders sourceName in row layout", () => {
      const html = renderToStaticMarkup(
        React.createElement(StoryCard, {
          story: testStory,
          layout: "row",
          index: 1,
        }),
      );

      expect(html).toContain("Tech News Daily");
      expect(html).toContain("Technology");
      expect(html).toContain("Breakthrough in Clean Energy Transmission");
      expect(html).toContain("01");
    });

    it("renders sourceName in cover layout", () => {
      const html = renderToStaticMarkup(
        React.createElement(StoryCard, {
          story: testStory,
          layout: "cover",
        }),
      );

      expect(html).toContain("Tech News Daily");
      expect(html).toContain("Technology");
      expect(html).toContain("Engineers develop high-capacity grid infrastructure.");
    });

    it("renders sourceName in FeaturedStory", () => {
      const html = renderToStaticMarkup(
        React.createElement(FeaturedStory, {
          story: testStory,
          eyebrow: "Spotlight",
        }),
      );

      expect(html).toContain("Tech News Daily");
      expect(html).toContain("Spotlight");
      expect(html).toContain("Breakthrough in Clean Energy Transmission");
    });
  });

  describe("ShareActions rendering", () => {
    it("renders accessible sharing links and copy button", () => {
      const html = renderToStaticMarkup(
        React.createElement(ShareActions, {
          title: "Important National Update",
          url: "https://eagleseye.com/stories/important-national-update",
        }),
      );

      // Section label
      expect(html).toContain(">Share</span>");
      // Copy button
      expect(html).toContain("Copy Link");
      expect(html).toContain("Copy article link to clipboard");
      // Social share links with rel=noopener noreferrer
      expect(html).toContain("Share story on X");
      expect(html).toContain("Share story on LinkedIn");
      expect(html).toContain("https://twitter.com/intent/tweet");
      expect(html).toContain("https://www.linkedin.com/sharing/share-offsite");
      expect(html).toContain("target=\"_blank\"");
      expect(html).toContain("rel=\"noopener noreferrer\"");
    });
  });
});
