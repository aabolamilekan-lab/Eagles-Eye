import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/components/search/SearchBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { CategoryCard } from "@/components/stories/CategoryCard";
import { FeaturedStory, StoryCard, StoryGrid } from "@/components/stories/StoryCard";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPublishedCategories } from "@/lib/queries/public/categories";
import {
  getFeaturedStories,
  getPopularStories,
  getPublishedStoryCount,
  getRecentStories,
} from "@/lib/queries/public/stories";
import { buildWebSiteJsonLd } from "@/lib/seo/jsonld";
import { buildPageMetadata, siteDescription } from "@/lib/seo/metadata";

/**
 * Home.
 *
 * Rendered on demand rather than prerendered at build, because the catalog is
 * read from PostgreSQL. Every read is wrapped in `unstable_cache` and tagged, so
 * the expensive queries are still served from cache and invalidated when the
 * admin publishes (AGENTS.md section 6, .agent/skills/reader-experience).
 */
export const dynamic = "force-dynamic";

// The home title is the site name itself; passing no leaf title keeps the
// layout template from rendering "Eagles Eye | Eagles Eye".
export function generateMetadata(): Metadata {
  return buildPageMetadata({
    description: siteDescription,
    path: "/",
  });
}

const FEATURED_LIMIT = 6;
const RECENT_LIMIT = 12;
const POPULAR_LIMIT = 4;
const CATEGORY_LIMIT = 6;

export default async function HomePage() {
  const [featured, recent, popular, categories, storyCount] =
    await Promise.all([
      getFeaturedStories(FEATURED_LIMIT),
      getRecentStories(RECENT_LIMIT),
      getPopularStories(POPULAR_LIMIT),
      getPublishedCategories(CATEGORY_LIMIT),
      getPublishedStoryCount(),
    ]);

  const [leadFeatured, ...restFeatured] = featured;
  const hasStories = storyCount > 0;
  const hasCategories = categories.length > 0;

  return (
    <div className="flex flex-col">
      <JsonLd data={buildWebSiteJsonLd()} />
      <section
        aria-labelledby="home-hero-heading"
        className="shell grid gap-12 pt-(--spacing-section) pb-(--spacing-section-sm) lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16"
      >
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-surface px-3 py-1 font-ui text-body-xs font-semibold text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Eagles Eye Catalogue
            </span>
          </div>
          <h1
            id="home-hero-heading"
            className="mt-5 max-w-2xl font-display text-display-lg text-ink text-balance tracking-tight"
          >
            {hasStories
              ? "Stories, published and read without the noise."
              : "A quiet catalogue for stories worth reading."}
          </h1>
          <p className="mt-5 max-w-xl font-ui text-body text-ink-muted text-pretty leading-relaxed">
            {hasStories
              ? "An independent catalogue for long-form fiction, gathered from writers around the world. Nothing stands between a story and the person reading it."
              : "The first story is on its way. Until then, browse the categories to see how the catalogue is organised."}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/stories" variant="primary" size="lg">
              Browse stories
            </ButtonLink>
            <ButtonLink href="/categories" variant="secondary" size="lg">
              Browse categories
            </ButtonLink>
          </div>

        </div>

        <div className="flex flex-col gap-6 lg:pt-4">
          <div className="rounded-md border border-border bg-surface p-6 shadow-xs transition-shadow hover:shadow-md">
            <h2 className="font-display text-heading-md text-ink">Find a story</h2>
            <p className="mt-1 font-ui text-body-sm text-ink-muted">
              Search published stories by title, topic, or keyword.
            </p>
            <div className="mt-4">
              <SearchBar />
            </div>
          </div>

          {hasCategories ? (
            <nav aria-label="Popular categories" className="rounded-md border border-border/80 bg-surface/60 p-5">
              <p className="label-micro text-ink-subtle mb-2">Popular Categories</p>
              <ul className="flex flex-col divide-y divide-border/40">
                {categories.slice(0, 4).map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/categories/${category.slug}`}
                      className="flex items-center justify-between py-2.5 px-2 font-ui text-body-sm text-ink-muted transition-colors rounded-sm hover:bg-surface-sunken hover:text-ink"
                    >
                      <span className="font-medium">{category.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </section>

      {!hasStories ? (
        <section className="shell pb-(--spacing-section)">
          <EmptyState
            title="No stories have been published yet"
            description="When the first story is published it will appear here, newest first. In the meantime, browse the categories to see how the catalogue is arranged."
            action={
              <ButtonLink href="/categories" variant="secondary">
                Browse categories
              </ButtonLink>
            }
          />
        </section>
      ) : null}

      {leadFeatured ? (
        <section
          aria-labelledby="home-featured-heading"
          className="shell pb-(--spacing-section)"
        >
          <SectionHeading
            id="home-featured-heading"
            eyebrow="Featured"
            title="Featured stories"
            action={
              <ButtonLink href="/stories" variant="ghost" size="sm">
                View all
              </ButtonLink>
            }
          />
          <FeaturedStory story={leadFeatured} priority />
          {restFeatured.length > 0 ? (
            <StoryGrid
              stories={restFeatured.slice(0, 3)}
              className="mt-6"
            />
          ) : null}
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section
          aria-labelledby="home-recent-heading"
          className="shell pb-(--spacing-section)"
        >
          <SectionHeading
            id="home-recent-heading"
            eyebrow="Latest"
            title="Recently published"
            action={
              <ButtonLink href="/stories" variant="ghost" size="sm">
                View all
              </ButtonLink>
            }
          />
          <StoryGrid stories={recent} />
        </section>
      ) : null}

      {popular.length > 0 ? (
        <section
          aria-labelledby="home-popular-heading"
          className="shell pb-(--spacing-section)"
        >
          <SectionHeading
            id="home-popular-heading"
            eyebrow="Most read"
            title="Popular with readers"
          />
          <ul className="flex max-w-3xl list-none flex-col divide-y divide-border">
            {popular.map((story) => (
              <li key={story.slug} className="py-5 first:pt-0 last:pb-0">
                <StoryCard story={story} layout="row" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasCategories ? (
        <section
          aria-labelledby="home-categories-heading"
          className="shell pb-(--spacing-section)"
        >
          <SectionHeading
            id="home-categories-heading"
            eyebrow="Browse"
            title="Categories"
            action={
              <ButtonLink href="/categories" variant="ghost" size="sm">
                View all
              </ButtonLink>
            }
          />
          <ul className="grid list-none grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.slug}>
                <CategoryCard category={category} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="home-cta-heading"
        className="shell pb-(--spacing-section)"
      >
        <div className="flex flex-col gap-6 border-t border-border pt-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2
              id="home-cta-heading"
              className="font-display text-display-sm text-ink text-balance"
            >
              A catalogue for readers, a desk for publishers.
            </h2>
            <p className="mt-2 font-ui text-body-sm text-ink-muted text-pretty">
              Eagles Eye keeps the reading side quiet and the publishing side
              focused. Learn how the two fit together.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/about" variant="secondary">
              About Eagles Eye
            </ButtonLink>
            <ButtonLink href="/stories" variant="ghost">
              Browse stories
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
