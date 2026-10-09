import { ContentStatus, Prisma } from "@prisma/client";
import type { StorySort } from "@/lib/validation/story";

/**
 * Published-story filter and order builders.
 *
 * This is the single owner of the public-visibility predicate (AGENTS.md
 * section 6): a story is public as soon as it is `PUBLISHED`, whether or not any
 * chapter is published yet. An unreadable story still renders an explicit
 * "no published chapters yet" state rather than being hidden. Kept free of
 * `next/cache` and the Prisma client so the builder is unit-testable and so the
 * cached read module cannot create an import cycle with it.
 */

export const PUBLIC_STORY_WHERE = {
  status: ContentStatus.PUBLISHED,
} satisfies Prisma.StoryWhereInput;

export interface StoryListFilters {
  q: string;
  category: string | null;
  tags: string[];
}

/** Whitelisted sort keys. No user string ever reaches `orderBy`. */
export const STORY_SORT_ORDER: Record<
  StorySort,
  Prisma.StoryOrderByWithRelationInput[]
> = {
  recent: [{ publishedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
  oldest: [{ publishedAt: { sort: "asc", nulls: "last" } }, { slug: "asc" }],
  popular: [
    { views: "desc" },
    { publishedAt: { sort: "desc", nulls: "last" } },
    { slug: "asc" },
  ],
  title: [{ title: "asc" }, { slug: "asc" }],
};

const LIKE_SPECIAL = /[\\%_]/g;

/**
 * Escape LIKE/ILIKE wildcards so a query of `%` searches for a literal `%`
 * instead of matching everything.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(LIKE_SPECIAL, (character) => `\\${character}`);
}

/**
 * Build the `where` for a catalogue page.
 *
 * Tags use AND semantics: selecting two tags narrows the result. Search is
 * case-insensitive across title, author and short description.
 */
export function buildStoryListWhere({
  q,
  category,
  tags,
}: StoryListFilters): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = { ...PUBLIC_STORY_WHERE };

  if (q) {
    const term = escapeLikeTerm(q);
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { shortDescription: { contains: term, mode: "insensitive" } },
      { author: { contains: term, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = { slug: category };
  }

  if (tags.length > 0) {
    where.AND = tags.map((slug) => ({
      storyTags: { some: { tag: { slug } } },
    }));
  }

  return where;
}

export interface StorySearchFilters {
  q: string;
  category: string | null;
  tags: string[];
}

/**
 * Build the `where` for a `/search` page.
 *
 * Shares the single public-visibility predicate, so a draft or archived story
 * can never leak into results. The term is matched
 * case-insensitively across the story's own text plus its category and tag
 * names. Every predicate is a parameterized Prisma `contains` (never string-built
 * SQL) and the term's LIKE wildcards are escaped, so `%` matches a literal `%`.
 * Facets narrow the same result set as the catalogue.
 */
export function buildStorySearchWhere({
  q,
  category,
  tags,
}: StorySearchFilters): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = { ...PUBLIC_STORY_WHERE };

  if (q) {
    const term = escapeLikeTerm(q);
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { author: { contains: term, mode: "insensitive" } },
      { shortDescription: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { category: { name: { contains: term, mode: "insensitive" } } },
      {
        storyTags: {
          some: { tag: { name: { contains: term, mode: "insensitive" } } },
        },
      },
    ];
  }

  if (category) {
    where.category = { slug: category };
  }

  if (tags.length > 0) {
    where.AND = tags.map((slug) => ({
      storyTags: { some: { tag: { slug } } },
    }));
  }

  return where;
}

export interface RelatedStorySignals {
  /** The story being viewed; never returned as related to itself. */
  excludeStoryId: string;
  /** Same-category stories are the strongest signal; may be null. */
  categoryId: string | null;
  /** Same-tag stories back up the category signal. */
  tagIds: string[];
}

/**
 * Build the `where` for a story detail page's related rail.
 *
 * Signals are OR-ed and every candidate still passes the shared public
 * predicate, so a draft or archived story can never appear.
 * With no category and no tags the caller gets an unfiltered (but still
 * published-only) fallback rather than an empty `OR: []` that matches nothing.
 */
export function buildRelatedStoryWhere({
  excludeStoryId,
  categoryId,
  tagIds,
}: RelatedStorySignals): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = {
    ...PUBLIC_STORY_WHERE,
    id: { not: excludeStoryId },
  };

  const signals: Prisma.StoryWhereInput[] = [];
  if (categoryId) {
    signals.push({ categoryId });
  }
  if (tagIds.length > 0) {
    signals.push({ storyTags: { some: { tagId: { in: tagIds } } } });
  }

  if (signals.length > 0) {
    where.OR = signals;
  }

  return where;
}
