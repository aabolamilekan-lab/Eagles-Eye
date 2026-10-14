import type { Metadata } from "next";
import { SearchX, Star } from "lucide-react";
import { JsonLd } from "@/components/seo/JsonLd";
import { StoryGrid } from "@/components/stories/StoryCard";
import { StoryFilters } from "@/components/stories/StoryFilters";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { getPublishedCategoryOptions } from "@/lib/queries/public/categories";
import { getPublishedFeaturedStoryList } from "@/lib/queries/public/stories";
import { getPublishedTagOptions } from "@/lib/queries/public/tags";
import {
  featuredListHref,
  parseStoryListSearch,
} from "@/lib/validation/story";
import { buildBreadcrumbJsonLd } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";

interface FeaturedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: FeaturedPageProps): Promise<Metadata> {
  const search = parseStoryListSearch(await searchParams);

  const canonicalPath =
    search.hasFilters || search.page > 1 || search.sort !== "recent"
      ? featuredListHref(search, { page: search.page })
      : "/featured";
  const leaf = search.q ? `Featured stories matching "${search.q}"` : "Featured Stories";
  const title = search.page > 1 ? `${leaf} – page ${search.page}` : leaf;

  const filtered = search.hasFilters || search.sort !== "recent";

  return buildPageMetadata({
    title,
    description: "Curated long-form stories handpicked by the editors of Eagles Eye.",
    path: canonicalPath,
    canonical: filtered ? false : canonicalPath,
    noindex: filtered,
  });
}

export default async function FeaturedPage({ searchParams }: FeaturedPageProps) {
  const search = parseStoryListSearch(await searchParams);

  const [result, categories, tags] = await Promise.all([
    getPublishedFeaturedStoryList({
      q: search.q,
      category: search.category,
      tags: search.tags,
      sort: search.sort,
      page: search.page,
    }),
    getPublishedCategoryOptions(),
    getPublishedTagOptions(),
  ]);

  return (
    <div className="shell py-(--spacing-section)">
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", url: "/" },
          { name: "Featured Stories" },
        ])}
      />
      <header className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFE500] px-3 py-1 font-ui text-[11px] font-black uppercase tracking-wider text-black">
          <Star className="size-3 fill-black" aria-hidden="true" />
          Editor&apos;s Pick
        </span>
        <h1 className="mt-4 font-display text-display-lg sm:text-display-xl text-ink text-balance font-bold tracking-tight">
          Featured Stories
        </h1>
        <p className="mt-3 font-ui text-body sm:text-body-read text-ink-muted text-pretty leading-relaxed">
          Curated long-form stories handpicked by our editors. Pure fiction, zero noise.
        </p>
      </header>

      <StoryFilters
        search={search}
        categories={categories}
        tags={tags}
        action="/featured"
        buildHref={(changes) => featuredListHref(search, changes)}
      />

      {result.total === 0 ? (
        <div className="mt-12">
          {search.hasFilters ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="No featured stories match these filters"
              description="Try a different search term, or clear the filters to view all featured stories."
              action={
                <ButtonLink href="/featured" variant="secondary">
                  Clear filters
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              icon={<Star className="size-6" />}
              title="No featured stories yet"
              description="When editors feature stories from our catalogue, they will appear here. In the meantime, browse the complete catalogue."
              action={
                <ButtonLink href="/stories" variant="secondary">
                  Browse all stories
                </ButtonLink>
              }
            />
          )}
        </div>
      ) : (
        <div className="mt-12">
          <StoryGrid stories={result.stories} />

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            totalItems={result.total}
            pageSize={result.pageSize}
            itemNoun="story"
            itemNounPlural="stories"
            showSummary={false}
            buildHref={(target) => featuredListHref(search, { page: target })}
            className="mt-12"
          />
        </div>
      )}
    </div>
  );
}
