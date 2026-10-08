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
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPublishedDate } from "@/lib/format";
import { getPublishedStoryDetail } from "@/lib/queries/public/stories";
import { parseContentSlug } from "@/lib/validation/story";
import { buildBreadcrumbJsonLd, buildStoryJsonLd } from "@/lib/seo/jsonld";
import { buildStoryPageMetadata } from "@/lib/seo/metadata";

/**
 * Story detail.
 *
 * Rendered on demand from PostgreSQL and cached through the tagged query layer.
 * Only a `PUBLISHED` story resolves; every other slug returns the same
 * `notFound()` as an unknown one. The chapter list is published-only and the
 * "Start reading" action is omitted when there is no published chapter
 * (AGENTS.md section 6).
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

  // noindex and no canonical while the story has no published chapter:
  // there is nothing to index and no preferred URL to claim.
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

  // Drops to a breadcrumb trail alone while the story has no published
  // chapter or no description: the Story/Article nodes are not emitted for
  // content a crawler must not read.
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

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-ui text-body-xs text-ink-subtle">
              {published && story.publishedAt ? (
                <time dateTime={story.publishedAt}>{published}</time>
              ) : null}
              <span className="tabular-nums">
                {story.chapterCount === 1
                  ? "1 chapter"
                  : `${story.chapterCount} chapters`}
              </span>
              {story.views > 0 ? (
                <span className="tabular-nums">
                  {story.views === 1
                    ? "1 read"
                    : `${story.views.toLocaleString("en-GB")} reads`}
                </span>
              ) : null}
            </div>

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

        <div className="mt-(--spacing-section) max-w-3xl">
          {story.hasPublishedChapters ? (
            <ChapterList storySlug={story.slug} chapters={story.chapters} />
          ) : (
            <EmptyState
              title="No published chapters yet"
              description="This story is published, but none of its chapters are. It will become readable the moment the first chapter is published."
              action={
                <ButtonLink href="/stories" variant="secondary">
                  Browse other stories
                </ButtonLink>
              }
            />
          )}
        </div>
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
