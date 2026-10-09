import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { ChapterList } from "@/components/chapters/ChapterList";
import { RichText } from "@/components/chapters/RichText";
import { Breadcrumbs, type Crumb } from "@/components/navigation/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { StoryCoverFallback, StoryGrid } from "@/components/stories/StoryCard";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/Card";
import { formatPublishedDate } from "@/lib/format";
import { getPublishedStoryDetail } from "@/lib/queries/public/stories";
import { parseContentSlug } from "@/lib/validation/story";
import { buildBreadcrumbJsonLd, buildStoryJsonLd } from "@/lib/seo/jsonld";
import { buildStoryPageMetadata } from "@/lib/seo/metadata";

/**
 * Story detail.
 *
 * Rendered on demand from PostgreSQL and cached through the tagged query layer.
 * A `PUBLISHED` story resolves whether or not it has a published chapter; every
 * other slug returns the same `notFound()` as an unknown one. The chapter list
 * is published-only and both it and the "Start reading" action are omitted when
 * there is no published chapter (AGENTS.md section 6).
 */
export const dynamic = "force-dynamic";

interface StoryDetailProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: StoryDetailProps): Promise<Metadata> {
  const slug = parseContentSlug((await params).slug);
  // Resolve existence before the route group's loading shell is flushed, so a
  // missing or non-published slug returns a real 404 instead of a streamed 200.
  if (!slug) {
    notFound();
  }

  const page = await getPublishedStoryDetail(slug);
  if (!page) {
    notFound();
  }

  // Indexable as soon as the story is published, even before its first chapter.
  return buildStoryPageMetadata(page.story);
}

export default async function StoryDetailPage({ params }: StoryDetailProps) {
  const slug = parseContentSlug((await params).slug);
  if (!slug) {
    notFound();
  }

  const page = await getPublishedStoryDetail(slug);
  if (!page) {
    notFound();
  }

  const { story, relatedStories } = page;
  const published = formatPublishedDate(story.publishedAt);
  const firstChapter = story.chapters[0] ?? null;

  const breadcrumbs: Crumb[] = [
    { label: "Home", href: "/" },
    ...(story.category
      ? [
          {
            label: story.category.name,
            href: `/categories/${story.category.slug}`,
          },
        ]
      : []),
    { label: story.title },
  ];

  // The Story/Article nodes are emitted for every published story and are only
  // dropped when there is no description to back them.
  const storyJsonLd = buildStoryJsonLd(story);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "/" },
    ...(story.category
      ? [
          {
            name: story.category.name,
            url: `/categories/${story.category.slug}`,
          },
        ]
      : []),
    { name: story.title },
  ]);

  return (
    <div className="pb-(--spacing-section)">
      {storyJsonLd.map((node, index) => (
        <JsonLd key={index} data={node} />
      ))}
      <JsonLd data={breadcrumbJsonLd} />

      <div className="shell">
        <Breadcrumbs items={breadcrumbs} className="pt-6" />
      </div>

      <header className="shell pt-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-14">
          <div className="relative aspect-[3/2] overflow-hidden rounded-md border border-border bg-surface-sunken lg:aspect-[4/5]">
            {story.coverImageUrl ? (
              <Image
                src={story.coverImageUrl}
                alt={story.coverAlt ?? ""}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 288px"
                className="object-cover"
              />
            ) : (
              <StoryCoverFallback title={story.title} />
            )}
          </div>

          <div className="flex flex-col">
            {story.category ? (
              <Link
                href={`/categories/${story.category.slug}`}
                className="inline-flex w-fit rounded-full transition-opacity hover:opacity-80"
              >
                <Badge tone="primary">{story.category.name}</Badge>
              </Link>
            ) : null}

            <h1 className="mt-4 font-display text-display-lg text-ink text-balance">
              {story.title}
            </h1>

            {story.author ? (
              <p className="mt-3 font-ui text-body text-ink-muted">
                By {story.author}
              </p>
            ) : null}

            {published && story.publishedAt ? (
              <time
                dateTime={story.publishedAt}
                className="mt-5 block font-ui text-body-xs text-ink-subtle"
              >
                {published}
              </time>
            ) : null}

            {story.shortDescription ? (
              <p className="mt-6 max-w-2xl font-ui text-body text-ink-muted text-pretty">
                {story.shortDescription}
              </p>
            ) : null}

            {firstChapter ? (
              <div className="mt-7">
                <ButtonLink
                  href={`/stories/${story.slug}/chapter/${firstChapter.slug}`}
                  variant="primary"
                  size="lg"
                  leadingIcon={<BookOpen className="size-4" />}
                >
                  Start reading
                </ButtonLink>
              </div>
            ) : null}

            {story.tags.length > 0 ? (
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="label-micro text-ink-subtle">Tags</span>
                {story.tags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`/stories?tag=${tag.slug}`}
                    className="inline-flex rounded-full transition-opacity hover:opacity-80"
                  >
                    <Badge tone="neutral">{tag.name}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="shell mt-(--spacing-section)">
        {story.description ? (
          <section aria-labelledby="story-about-heading">
            <h2
              id="story-about-heading"
              className="font-display text-display-sm text-ink"
            >
              About this story
            </h2>
            <RichText
              html={story.description}
              headingOffset={2}
              className="mt-4 max-w-(--container-prose)"
            />
          </section>
        ) : null}

        {story.hasPublishedChapters ? (
          <div className="mt-(--spacing-section) max-w-3xl">
            <ChapterList storySlug={story.slug} chapters={story.chapters} />
          </div>
        ) : null}
      </div>

      {relatedStories.length > 0 ? (
        <section
          aria-labelledby="story-related-heading"
          className="shell mt-(--spacing-section)"
        >
          <SectionHeading
            id="story-related-heading"
            eyebrow="More to read"
            title="Related stories"
          />
          <StoryGrid stories={relatedStories} />
        </section>
      ) : null}
    </div>
  );
}
