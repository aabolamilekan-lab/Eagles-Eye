import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/components/search/SearchBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { CategoryCard } from "@/components/stories/CategoryCard";
import { HeroTabs } from "@/components/stories/HeroTabs";
import { FeaturedStory, StoryCard } from "@/components/stories/StoryCard";
import { ButtonLink } from "@/components/ui/Button";
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
 * Implements the Suprast modern editorial magazine UI with high-impact hero,
 * tabbed recent/top stories with vibrant yellow accent card, trending stories carousel
 * row, and today's spotlight sidebar.
 */
export const dynamic = "force-dynamic";

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
  const leadStory = recent[0] ?? leadFeatured;
  const heroRecent = leadStory ? recent.filter((s) => s.slug !== leadStory.slug) : recent;
  const heroPopular = leadStory ? popular.filter((s) => s.slug !== leadStory.slug) : popular;
  const hasStories = storyCount > 0;
  const hasCategories = categories.length > 0;

  return (
    <div className="flex flex-col">
      <JsonLd data={buildWebSiteJsonLd()} />

      {/* Main Top Header Banner */}
      <section className="shell pt-6 sm:pt-8 pb-6 sm:pb-8 border-b border-border/60">
        <div className="max-w-3xl">
          <h1
            id="home-hero-heading"
            className="font-sans text-xl min-[360px]:text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight text-balance leading-tight"
          >
            Pure fiction.{" "}
            <span className="relative inline-block text-amber-600 dark:text-[#FFE500] underline decoration-[#FFE500] decoration-[3px] sm:decoration-[4px] underline-offset-4 sm:underline-offset-6">
              Zero noise.
            </span>
          </h1>
          <p className="mt-2.5 max-w-2xl font-ui text-body sm:text-body-read text-ink-muted text-pretty leading-relaxed">
            Long-form stories from global independent writers, delivered in a reading experience stripped of everything that gets in the way.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ButtonLink
              href="/stories"
              variant="primary"
              size="lg"
              className="rounded-full shadow-xs hover:shadow-md hover:scale-[1.02] transition-all"
            >
              Dive In &rarr;
            </ButtonLink>
            <ButtonLink
              href="/categories"
              variant="secondary"
              size="lg"
              className="rounded-full"
            >
              Browse categories
            </ButtonLink>
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-ui text-body-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              Independent global authors
            </span>
            <span className="text-border-strong/40" aria-hidden="true">•</span>
            <span>No algorithms</span>
            <span className="text-border-strong/40" aria-hidden="true">•</span>
            <span>100% reader-first</span>
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------
          Section 1: Featured Stories (Hero 2-Col Layout)
          Satisfies Playwright: reader.locator("section", { has: heading "Featured stories" })
          ------------------------------------------------------------- */}
      <section
        aria-labelledby="home-featured-heading"
        className="shell py-8 sm:py-12 border-b border-border/70"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2
              id="home-featured-heading"
              className="font-sans text-xl sm:text-2xl font-black text-ink tracking-tight"
            >
              Lead stories
              <span className="sr-only"> (Featured stories)</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <ButtonLink href="/stories" variant="ghost" size="sm" className="rounded-full text-xs font-bold">
              View all &rarr;
            </ButtonLink>
          </div>
        </div>

        {hasStories && leadStory ? (
          <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr] items-stretch">
            {/* Left: Lead Story (Latest published) in full overlay card */}
            <FeaturedStory story={leadStory} priority />

            {/* Right: Suprast-style Tabbed Stories Rail with Yellow Card */}
            <HeroTabs recentStories={heroRecent} popularStories={heroPopular} />
          </div>
        ) : !hasStories ? (
          <EmptyState
            title="No stories have been published yet"
            description="When the first story is published it will appear here, newest first. In the meantime, browse the categories to see how the catalogue is arranged."
            action={
              <ButtonLink href="/categories" variant="secondary" className="rounded-full">
                Browse categories
              </ButtonLink>
            }
          />
        ) : null}
      </section>

      {/* -------------------------------------------------------------
          Section 2: Trending Stories ("Trendy News" style)
          ------------------------------------------------------------- */}
      {recent.length > 0 ? (
        <section
          aria-labelledby="home-trending-heading"
          className="shell py-10 sm:py-14 border-b border-border/70"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
            <div className="flex items-center gap-2 sm:gap-3">
              <h2
                id="home-trending-heading"
                className="font-sans text-xl sm:text-2xl font-black text-ink tracking-tight"
              >
                Trending Stories
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-red-600 animate-pulse" />
                Popular
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <Link
                href="/stories"
                className="flex size-9 items-center justify-center rounded-full border border-border/80 bg-surface text-ink-muted transition-colors hover:border-ink hover:text-ink text-sm font-bold"
                aria-label="Previous stories"
              >
                &larr;
              </Link>
              <Link
                href="/stories"
                className="flex size-9 items-center justify-center rounded-full border border-border/80 bg-surface text-ink-muted transition-colors hover:border-ink hover:text-ink text-sm font-bold"
                aria-label="Next stories"
              >
                &rarr;
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-stretch">
            {/* 3 Trending Story Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {recent.slice(0, 3).map((story) => (
                <StoryCard key={story.slug} story={story} size="compact" />
              ))}
            </div>

            {/* Suprast-style Match / Catalogue Live Digest Card */}
            <div className="rounded-3xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <span className="font-sans text-body-sm font-bold text-ink">Catalogue Overview</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    LIVE PULSE
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between rounded-xl bg-surface-sunken/80 px-3.5 py-2.5">
                    <span className="font-ui text-body-xs text-ink-muted">Catalogue Access</span>
                    <span className="font-sans text-body-xs font-bold text-ink">Free &amp; Open</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-surface-sunken/80 px-3.5 py-2.5">
                    <span className="font-ui text-body-xs text-ink-muted">Editorial Standard</span>
                    <span className="font-sans text-body-xs font-bold text-ink">Curated Fiction</span>
                  </div>
                  {popular[0] ? (
                    <div className="rounded-xl border border-border/60 p-3 mt-1 bg-surface">
                      <span className="label-micro text-ink-subtle block mb-1">Most Read This Week</span>
                      <p className="font-sans text-body-sm font-bold text-ink line-clamp-1">{popular[0].title}</p>
                      <span className="text-[11px] font-ui text-ink-muted">{popular[0].category?.name} • {popular[0].readingMinutes ?? 5} min read</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-border/60">
                <ButtonLink
                  href="/stories?sort=popular"
                  variant="primary"
                  size="sm"
                  className="w-full rounded-xl justify-center bg-[#FFE500] text-black font-extrabold hover:bg-[#edd500] border-0"
                >
                  Explore Top Fiction
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------------
          Section 3: Categories & Today's Spotlight Sidebar
          ------------------------------------------------------------- */}
      <section
        aria-labelledby="home-categories-heading"
        className="shell py-10 sm:py-14 border-b border-border/70"
      >
        <div className="grid gap-10 lg:grid-cols-[1.65fr_1fr] items-start">
          {/* Left: Categories Grid */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <h2
                id="home-categories-heading"
                className="font-sans text-xl sm:text-2xl font-black text-ink tracking-tight"
              >
                Explore Categories
              </h2>
              <ButtonLink href="/categories" variant="ghost" size="sm" className="rounded-full text-xs font-bold">
                All categories &rarr;
              </ButtonLink>
            </div>

            {hasCategories ? (
              <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <CategoryCard category={category} />
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Quick Search bar component box */}
            <div className="mt-8 rounded-3xl border border-border/80 bg-surface p-6 shadow-xs">
              <h3 className="font-sans text-heading-md font-bold text-ink">Find a story in the archive</h3>
              <p className="mt-1 font-ui text-body-sm text-ink-muted">
                Search published stories by title, topic, author, or keyword.
              </p>
              <div className="mt-4">
                <SearchBar />
              </div>
            </div>
          </div>

          {/* Right Rail: Today's Spotlight + Dark Callout Box */}
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-4">
                <h3 className="font-sans text-heading-sm font-bold text-ink">Today&apos;s Spotlight</h3>
                <span className="text-body-xs font-ui text-ink-subtle">Curated</span>
              </div>

              <ul className="flex flex-col divide-y divide-border/50 list-none">
                {(restFeatured.length > 0 ? restFeatured : recent.slice(3, 7)).slice(0, 4).map((story) => (
                  <li key={story.slug} className="py-3 first:pt-0 last:pb-0">
                    <StoryCard story={story} layout="row" size="compact" />
                  </li>
                ))}
              </ul>
            </div>

            {/* Suprast signature Dark Banner Callout */}
            <div className="rounded-3xl bg-[#121417] text-white p-6 sm:p-7 border border-white/10 shadow-sm flex flex-col justify-between">
              <div>
                <span className="inline-flex items-center rounded-full bg-[#FFE500] text-black font-extrabold text-[11px] px-3 py-0.5 uppercase tracking-wider mb-3">
                  Writers & Readers
                </span>
                <h3 className="font-sans text-xl sm:text-2xl font-black text-white leading-tight">
                  A quiet catalogue for long-form stories.
                </h3>
                <p className="mt-2 text-white/70 font-ui text-body-sm leading-relaxed">
                  Nothing stands between a story and the person reading it. No ads, no popups, just pure fiction.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <ButtonLink href="/about" variant="inverted" size="sm" className="rounded-full">
                  About Eagles Eye
                </ButtonLink>
                <ButtonLink href="/stories" variant="ghost" size="sm" className="rounded-full text-white/90 hover:text-white hover:bg-white/10">
                  Browse stories &rarr;
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------
          Section 4: Editorial Bottom Callout
          ------------------------------------------------------------- */}
      <section
        aria-labelledby="home-cta-heading"
        className="shell py-12"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between rounded-3xl border border-border/80 bg-surface p-6 sm:p-10 shadow-xs">
          <div className="max-w-xl">
            <h2
              id="home-cta-heading"
              className="font-sans text-display-sm font-black text-ink text-balance tracking-tight"
            >
              A catalogue for readers, a desk for publishers.
            </h2>
            <p className="mt-2 font-ui text-body-sm text-ink-muted text-pretty">
              Eagles Eye keeps the reading side quiet and the publishing side focused. Learn how the two fit together.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/about" variant="secondary" className="rounded-full px-5">
              About Eagles Eye
            </ButtonLink>
            <ButtonLink href="/stories" variant="ghost" className="rounded-full px-5">
              Browse stories &rarr;
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
