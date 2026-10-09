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
import {
  countWords,
  formatPublishedDate,
  toPlainText,
} from "@/lib/format";
import { getPublishedChapterReader } from "@/lib/queries/public/stories";
import { parseContentSlug } from "@/lib/validation/story";
import { buildBreadcrumbJsonLd, buildChapterJsonLd } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";

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

  return buildPageMetadata({
    // One title for the tag, both cards, and the browser tab — clamped on a
    // word boundary so a long pair never ends mid-word.
    title: `${chapter.title} – ${story.title}`,
    description: toPlainText(chapter.content),
    path: `/stories/${story.slug}/chapter/${chapter.slug}`,
    type: "article",
    image: story.coverImageUrl,
    imageAlt: story.title,
    publishedTime: chapter.publishedAt,
    modifiedTime: chapter.updatedAt,
  });
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

  const plainText = toPlainText(chapter.content);
  const wordCount = countWords(plainText);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));

  // An Article node with a Story parent — not a bare `Chapter` node, which
  // implies a book structure this platform does not model. Returns null when
  // the body yields no description, and the breadcrumb trail still renders.
  const chapterJsonLd = buildChapterJsonLd({
    story: {
      title: story.title,
      slug: story.slug,
      coverImageUrl: story.coverImageUrl,
    },
    chapter: {
      title: chapter.title,
      slug: chapter.slug,
      publishedAt: chapter.publishedAt,
      updatedAt: chapter.updatedAt,
    },
    description: plainText,
    wordCount,
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "/" },
    { name: story.title, url: `/stories/${story.slug}` },
    { name: chapter.title },
  ]);

  return (
    <>
      {chapterJsonLd ? <JsonLd data={chapterJsonLd} /> : null}
      <JsonLd data={breadcrumbJsonLd} />

      <ReadingLayout
        utilityBar={<ReadingProgress />}
        breadcrumbs={breadcrumbs}
        chapterTitle={chapter.title}
        chapterMeta={
          <>
            {story.author ? <span>By {story.author}</span> : null}
            {published && chapter.publishedAt ? (
              <>
                <span aria-hidden="true" className="text-ink-subtle/60">•</span>
                <time dateTime={chapter.publishedAt}>{published}</time>
              </>
            ) : null}
            <span aria-hidden="true" className="text-ink-subtle/60">•</span>
            <span className="tabular-nums">
              Chapter {reader.currentNumber} of {reader.totalCount}
            </span>
            <span aria-hidden="true" className="text-ink-subtle/60">•</span>
            <span className="tabular-nums">{readingMinutes} min read</span>
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
