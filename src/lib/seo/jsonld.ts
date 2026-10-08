import { absoluteUrl } from "./canonical";
import { DEFAULT_OG_IMAGE } from "./open-graph";
import { siteName, clampDescription, clampTitle } from "./metadata";
import { ogImageUrl } from "./cover-url";

/**
 * JSON-LD for public routes.
 *
 * Plain objects assembled on the server from published data only, rendered
 * through `JsonLd`, which escapes `<` (AGENTS.md section 10). Two rules shape
 * every node here:
 *
 * - **No `author`.** `SKILL.md`: never invent one. The schema allows it, but
 *   emitting a fabricated name to structured data would claim something the
 *   page cannot back.
 * - **Drop a node that has no description.** An Article without a description
 *   is a thin signal; silence beats a weak one.
 *
 * Every URL is absolute through the canonical builder — a relative `og:url`
 * or `mainEntityOfPage` is invalid the moment a crawler resolves it.
 */

export interface BreadcrumbItem {
  name: string;
  url?: string;
}

/**
 * `WebSite` with a `SearchAction`, so a search box can surface in results.
 * Targets `/search?q=` — the one public route whose state lives in a query
 * string (faceted listing state is the documented exception to clean URLs).
 */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Breadcrumb trail. A trailing crumb has no URL of its own (it *is* the
 * current page), so its `item` is omitted rather than pointing at itself
 * with a fragment.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: absoluteUrl(item.url) } : {}),
    })),
  };
}

export interface StoryJsonLdInput {
  title: string;
  /** Plain text from the query layer; never markup. */
  seoDescription: string;
  slug: string;
  coverImageUrl: string | null;
  /** ISO 8601, or null when absent. */
  publishedAt: string | null;
  /** ISO 8601. */
  updatedAt: string;
  category: { name: string } | null;
  tags: Array<{ name: string }>;
  hasPublishedChapters: boolean;
}

/**
 * The story page emits two nodes: `Story` (the reading surface) and `Article`
 * (what aggregators expect for a dated work). Both carry the same core fields;
 * both are dropped when the story has no published chapter or no description,
 * because an unreadable story is not indexable content.
 */
export function buildStoryJsonLd(story: StoryJsonLdInput): object[] {
  const description = clampDescription(story.seoDescription);
  if (!description || !story.hasPublishedChapters) {
    return [];
  }

  const url = absoluteUrl(`/stories/${story.slug}`);
  const image = absoluteUrl(
    ogImageUrl(story.coverImageUrl ?? DEFAULT_OG_IMAGE),
  );

  const shared = {
    headline: clampTitle(story.title),
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image,
    publisher: {
      "@type": "Organization",
      name: siteName,
      logo: absoluteUrl("/logo.png"),
    },
    ...(story.publishedAt ? { datePublished: story.publishedAt } : {}),
    dateModified: story.updatedAt,
    ...(story.category ? { articleSection: story.category.name } : {}),
    ...(story.tags.length > 0
      ? { keywords: story.tags.map((tag) => tag.name).join(", ") }
      : {}),
  };

  return [
    { "@context": "https://schema.org", "@type": "Story", ...shared },
    { "@context": "https://schema.org", "@type": "Article", ...shared },
  ];
}

export interface ChapterJsonLdInput {
  story: {
    title: string;
    slug: string;
    coverImageUrl: string | null;
  };
  chapter: {
    title: string;
    slug: string;
    /** ISO 8601, or null when absent. */
    publishedAt: string | null;
    /** ISO 8601. */
    updatedAt: string;
  };
  /** Plain-text excerpt of the chapter, already derived from `content`. */
  description: string;
  /** Whole-word count of the plain-text body. */
  wordCount: number;
}

/**
 * The chapter page emits an `Article` node — not a `Chapter` node — whose
 * `isPartOf` points back at the story. A bare `Chapter` node implies a
 * book/section structure this platform does not model, and the headline is
 * prefixed with the story title so the snippet reads correctly out of
 * context.
 *
 * Dropped entirely when the body yields no description.
 */
export function buildChapterJsonLd({
  story,
  chapter,
  description,
  wordCount,
}: ChapterJsonLdInput): object | null {
  const summary = clampDescription(description);
  if (!summary) {
    return null;
  }

  const url = absoluteUrl(`/stories/${story.slug}/chapter/${chapter.slug}`);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: clampTitle(`${chapter.title} – ${story.title}`),
    description: summary,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: absoluteUrl(
      ogImageUrl(story.coverImageUrl ?? DEFAULT_OG_IMAGE),
    ),
    ...(chapter.publishedAt ? { datePublished: chapter.publishedAt } : {}),
    dateModified: chapter.updatedAt,
    wordCount,
    isPartOf: {
      "@type": "Story",
      url: absoluteUrl(`/stories/${story.slug}`),
      name: story.title,
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
      logo: absoluteUrl("/logo.png"),
    },
  };
}

export interface CollectionPageJsonLdInput {
  name: string;
  slug: string;
  description: string | null;
}

/** Category detail page: a `CollectionPage` of published stories. */
export function buildCollectionPageJsonLd({
  name,
  slug,
  description,
}: CollectionPageJsonLdInput) {
  const summary = description ? clampDescription(description) : "";

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url: absoluteUrl(`/categories/${slug}`),
    ...(summary ? { description: summary } : {}),
  };
}
