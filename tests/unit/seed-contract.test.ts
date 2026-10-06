import { ContentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { categories, seedStories, tags } from "../../prisma/seed";

/**
 * Seed contract: locks the content guarantees the platform and the E2E suite
 * rely on (four categories, five fictional stories spanning the three content
 * statuses, and at least three chapters per story).
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function expectUniqueSlugs(entries: readonly { slug: string }[]): void {
  const slugs = entries.map((entry) => entry.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const slug of slugs) {
    expect(slug).toMatch(SLUG_PATTERN);
  }
}

describe("seed contract", () => {
  it("defines exactly four categories with unique, well-formed slugs", () => {
    expect(categories).toHaveLength(4);
    expectUniqueSlugs(categories);
  });

  it("defines tags with unique, well-formed slugs", () => {
    expect(tags.length).toBeGreaterThan(0);
    expectUniqueSlugs(tags);
  });

  it("defines five stories spanning DRAFT, PUBLISHED and ARCHIVED", () => {
    expect(seedStories).toHaveLength(5);
    expectUniqueSlugs(seedStories);

    const statuses = new Set(seedStories.map((story) => story.status));
    expect(statuses).toEqual(
      new Set([ContentStatus.DRAFT, ContentStatus.PUBLISHED, ContentStatus.ARCHIVED]),
    );
  });

  it("gives every story at least three sequentially numbered chapters", () => {
    for (const story of seedStories) {
      expect(story.chapters.length, story.slug).toBeGreaterThanOrEqual(3);

      const numbers = story.chapters.map((chapter) => chapter.chapterNumber);
      expect(numbers, story.slug).toEqual(numbers.map((_, index) => index + 1));

      const chapterSlugs = story.chapters.map((chapter) => chapter.slug);
      expect(new Set(chapterSlugs).size, story.slug).toBe(chapterSlugs.length);
    }
  });

  it("keeps chapter status and publishedAt consistent", () => {
    for (const story of seedStories) {
      for (const chapter of story.chapters) {
        const validStatus = Object.values(ContentStatus).includes(chapter.status);
        expect(validStatus, `${story.slug}/${chapter.slug}`).toBe(true);

        if (chapter.status === ContentStatus.PUBLISHED) {
          expect(chapter.publishedAt, `${story.slug}/${chapter.slug}`).toBeInstanceOf(Date);
        } else {
          expect(chapter.publishedAt, `${story.slug}/${chapter.slug}`).toBeNull();
        }
      }
    }
  });

  it("publishes only stories that have at least one published chapter", () => {
    for (const story of seedStories) {
      const publishedChapters = story.chapters.filter(
        (chapter) => chapter.status === ContentStatus.PUBLISHED,
      );

      if (story.status === ContentStatus.PUBLISHED) {
        expect(publishedChapters.length, story.slug).toBeGreaterThan(0);
        expect(story.publishedAt, story.slug).toBeInstanceOf(Date);
      }

      if (story.status === ContentStatus.DRAFT) {
        expect(story.publishedAt, story.slug).toBeNull();
      }
    }
  });

  it("wires every story to a seeded category and seeded tags", () => {
    const categorySlugs: Set<string> = new Set(
      categories.map((category) => category.slug),
    );
    const tagSlugs: Set<string> = new Set(tags.map((tag) => tag.slug));

    for (const story of seedStories) {
      if (story.categorySlug !== null) {
        expect(categorySlugs.has(story.categorySlug), story.slug).toBe(true);
      }
      for (const tagSlug of story.tagSlugs) {
        expect(tagSlugs.has(tagSlug), story.slug).toBe(true);
      }
    }
  });
});
