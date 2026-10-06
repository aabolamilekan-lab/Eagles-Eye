import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChapterIndex } from "@/components/chapters/ChapterIndex";
import { ChapterNav } from "@/components/chapters/ChapterNav";
import { ReadingLayout } from "@/components/chapters/ReadingLayout";
import { ReadingProgress } from "@/components/chapters/ReadingProgress";
import { RichText } from "@/components/chapters/RichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { ButtonLink } from "@/components/ui/Button";
import { formatPublishedDate, toPlainTextExcerpt } from "@/lib/format";
import { getPublishedChapterReader } from "@/lib/queries/public/stories";
import { parseContentSlug } from "@/lib/validation/story";

/**
 * Chapter reader.
 *
 * Rendered on demand from PostgreSQL and cached through the tagged query layer.
 * A chapter resolves only when its story is public and the chapter is
 * `PUBLISHED`; every other combination is the same `notFound()` as an unknown
 * slug (AGENTS.md section 6). The body renders through `RichText`, which
 * re-sanitizes with the shared allowlist and offsets stored headings, so the
 * page keeps exactly one `<h1>`.
 */
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface ChapterReaderProps {
  params: Promise<{ slug: string; chapterSlug: string }>;
}

async function resolveReader(params: ChapterReaderProps["params"]) {
  const { slug: rawStorySlug, chapterSlug: rawChapterSlug } = await params;
  const storySlug = parseContentSlug(rawStorySlug);
  const chapterSlug = parseContentSlug(rawChapterSlug);
  if (!storySlug || !chapterSlug) {
    notFound();
  }

  const reader = await getPublishedChapterReader(storySlug, chapterSlug);
  if (!reader) {
    notFound();
  }

  return reader;
}

export async function generateMetadata({
  params,
}: ChapterReaderProps): Promise<Metadata> {
  // Resolve existence before the route's shell is flushed, so a missing or
  // non-published chapter returns a real 404 instead of a streamed 200.
  const { story, chapter } = await resolveReader(params);
  const description =
    toPlainTextExcerpt(chapter.content) ||
    `Read “${chapter.title}” from ${story.title} on Eagles Eye.`;

  return {
    title: `${chapter.title} — ${story.title}`,
    description,
    alternates: {
      canonical: `/stories/${story.slug}/chapter/${chapter.slug}`,
    },
    openGraph: {
      type: "article",
      title: chapter.title,
      description,
      url: `/stories/${story.slug}/chapter/${chapter.slug}`,
      publishedTime: chapter.publishedAt ?? undefined,
    },
    twitter: {
      card: "summary",
      title: chapter.title,
      description,
    },
  };
}

export default async function ChapterReaderPage({
  params,
}: ChapterReaderProps) {
  const reader = await resolveReader(params);
  const { story, chapter, chapters, previous, next } = reader;

  const published = formatPublishedDate(chapter.publishedAt);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: story.title, href: `/stories/${story.slug}` },
    { label: chapter.title },
  ];

  const chapterUrl = new URL(
    `/stories/${story.slug}/chapter/${chapter.slug}`,
    BASE_URL,
  ).toString();
  const storyUrl = new URL(`/stories/${story.slug}`, BASE_URL).toString();

  const chapterJsonLd = {
    "@context": "https://schema.org",
    "@type": "Chapter",
    name: chapter.title,
    headline: chapter.title,
    datePublished: chapter.publishedAt ?? undefined,
    position: reader.currentNumber,
    url: chapterUrl,
    isPartOf: { "@type": "Book", name: story.title, url: storyUrl },
    inLanguage: "en",
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: crumb.href ? new URL(crumb.href, BASE_URL).toString() : undefined,
    })),
  };

  return (
    <>
      <JsonLd data={chapterJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      <ReadingLayout
        utilityBar={<ReadingProgress />}
        breadcrumbs={breadcrumbs}
        chapterTitle={chapter.title}
        chapterMeta={
          <>
            {story.author ? <span>By {story.author}</span> : null}
            {published && chapter.publishedAt ? (
              <time dateTime={chapter.publishedAt}>{published}</time>
            ) : null}
            <span className="tabular-nums">
              Chapter {reader.currentNumber} of {reader.totalCount}
            </span>
          </>
        }
        footer={
          <div className="reading-column">
            <ChapterNav
              storySlug={story.slug}
              storyTitle={story.title}
              currentNumber={reader.currentNumber}
              totalCount={reader.totalCount}
              previous={previous}
              next={next}
            />

            <ChapterIndex
              storySlug={story.slug}
              chapters={chapters}
              className="mt-10"
            />

            <div className="mt-8">
              <ButtonLink
                href={`/stories/${story.slug}`}
                variant="ghost"
                leadingIcon={<ArrowLeft className="size-4" />}
              >
                Back to {story.title}
              </ButtonLink>
            </div>
          </div>
        }
      >
        <div className="reading-column">
          <RichText html={chapter.content} headingOffset={1} />
        </div>
      </ReadingLayout>
    </>
  );
}
