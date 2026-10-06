import { absoluteUrl, siteName } from "./metadata";
import { coverUrl } from "./cover-url";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: absoluteUrl("/"),
  };
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

interface ArticleArgs {
  story: {
    title: string;
    description: string | null;
    author: string;
    coverImage: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
  };
  chapter?: {
    title: string;
    publishedAt: Date | null;
    updatedAt: Date;
  };
  canonical: string;
}

export function buildArticleJsonLd({ story, chapter, canonical }: ArticleArgs) {
  const headline = chapter ? `${chapter.title} – ${story.title}` : story.title;
  const description = story.description ?? undefined;
  const cover = coverUrl(story.coverImage);
  const image = cover ? [absoluteUrl(cover)] : undefined;
  const publishedTime =
    chapter?.publishedAt ?? story.publishedAt ?? undefined;
  const modifiedTime = chapter?.updatedAt ?? story.updatedAt;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    image,
    author: {
      "@type": "Person",
      name: story.author,
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
    datePublished: publishedTime ? new Date(publishedTime).toISOString() : undefined,
    dateModified: new Date(modifiedTime).toISOString(),
  };
}
