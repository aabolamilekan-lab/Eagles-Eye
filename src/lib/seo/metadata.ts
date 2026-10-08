import type { Metadata } from "next";
import type { PublishedStoryDetail } from "@/lib/queries/public/story-detail";
import { absoluteUrl } from "./canonical";
import { buildOpenGraph } from "./open-graph";
import { buildTwitter } from "./twitter";

/**
 * Shared public metadata.
 *
 * Every public route funnels through {@link buildPageMetadata}, so title
 * templating, clamping, canonicals, robots policy and the social card are
 * decided in exactly one place (`.agent/skills/seo/SKILL.md`). A route that
 * hand-rolls its own `Metadata` is how the pages drifted apart before: three
 * different twitter cards, an og:url left relative, an image with no
 * dimensions.
 */

export const siteName = "Eagles Eye";
export const siteDescription =
  "A quiet catalogue for stories worth reading. Discover, explore, and read published stories and chapters without distraction.";

/** Truncate on a word boundary so a title never ends mid-word. */
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

function clampWords(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }

  // Room for the ellipsis, then back off to the last whole word.
  const clipped = normalized.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  const words = (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
  return `${words}…`;
}

export function clampTitle(title: string): string {
  return clampWords(title, TITLE_MAX);
}

export function clampDescription(description: string): string {
  return clampWords(description, DESCRIPTION_MAX);
}

/**
 * Robots for a public page that must not be indexed.
 *
 * Followed, not blocked: the links on the page still lead somewhere a crawler
 * may usefully go. Blocking would also hide an unpublished chapter's presence
 * from being *reached*, which is not required — absence from listings,
 * sitemap and metadata is the guarantee (AGENTS.md section 6).
 */
export function robotsForNonIndexable(): Metadata["robots"] {
  return { index: false, follow: true };
}

export interface BuildPageMetadataInput {
  /**
   * Leaf title; the root layout template appends the site name. Omit it for
   * the home page, whose title *is* the site name and must not read
   * "Eagles Eye | Eagles Eye".
   */
  title?: string;
  description?: string | null;
  /** Path this page's canonical and Open Graph URL resolve against. */
  path: string;
  /**
   * Override the canonical path, or `false` to emit no canonical at all —
   * used for a noindex view that must not claim a preferred URL.
   */
  canonical?: string | false;
  noindex?: boolean;
  type?: "website" | "article";
  /** Cover path; `null`/omitted falls back to the default social image. */
  image?: string | null;
  imageAlt?: string;
  publishedTime?: string | Date | null;
  modifiedTime?: string | Date | null;
}

/**
 * Metadata for one public route.
 *
 * The canonical is emitted absolute (`SKILL.md`: canonical is absolute) so
 * correctness does not depend on `metadataBase` resolution. Open Graph and
 * Twitter always carry a 1200×630 image — a cover when there is one, the
 * default card otherwise — so no card ever renders blank.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  canonical = undefined,
  noindex = false,
  type = "website",
  image = undefined,
  imageAlt = undefined,
  publishedTime = null,
  modifiedTime = null,
}: BuildPageMetadataInput): Metadata {
  const leaf = title === undefined ? undefined : clampTitle(title);
  const normalizedDescription =
    description == null || description.trim() === ""
      ? undefined
      : clampDescription(description);
  const displayTitle =
    leaf === undefined ? siteName : `${leaf} | ${siteName}`;

  const canonicalPath = canonical === false ? undefined : (canonical ?? path);
  const ogPath = canonicalPath ?? path;

  return {
    ...(leaf === undefined ? {} : { title: leaf }),
    ...(normalizedDescription === undefined
      ? {}
      : { description: normalizedDescription }),
    ...(canonicalPath === undefined
      ? {}
      : { alternates: { canonical: absoluteUrl(canonicalPath) } }),
    ...(noindex ? { robots: robotsForNonIndexable() } : {}),
    openGraph: {
      siteName,
      ...buildOpenGraph({
        title: displayTitle,
        description: normalizedDescription,
        path: ogPath,
        type,
        image,
        imageAlt,
        publishedTime: publishedTime ?? undefined,
        modifiedTime: modifiedTime ?? undefined,
      }),
    },
    twitter: buildTwitter({
      title: displayTitle,
      description: normalizedDescription,
      image,
      imageAlt,
    }),
  };
}

/**
 * Metadata for a published story detail page.
 *
 * A story with no published chapter is visible in admin and nowhere else: it
 * carries `noindex` and no canonical, because there is nothing to index and no
 * preferred URL to claim for it (AGENTS.md section 6). The cover, when
 * present, is the article image on both cards; otherwise the default card
 * image applies.
 */
export function buildStoryPageMetadata(
  story: PublishedStoryDetail,
): Metadata {
  const indexable = story.hasPublishedChapters;

  return buildPageMetadata({
    title: story.title,
    description: story.seoDescription,
    path: `/stories/${story.slug}`,
    canonical: indexable ? undefined : false,
    noindex: !indexable,
    type: "article",
    image: story.coverImageUrl,
    imageAlt: story.title,
    publishedTime: story.publishedAt,
    modifiedTime: story.updatedAt,
  });
}
