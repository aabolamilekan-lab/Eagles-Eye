import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { JsonLd } from "@/components/seo/JsonLd";
import { StoryGrid } from "@/components/stories/StoryCard";
import { StoryFilters } from "@/components/stories/StoryFilters";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { getPublishedStoryList } from "@/lib/queries/public/stories";
import { getPublishedCategoryOptions } from "@/lib/queries/public/categories";
import { getPublishedTagOptions } from "@/lib/queries/public/tags";
import { parseStoryListSearch, storyListHref } from "@/lib/validation/story";
import { buildBreadcrumbJsonLd } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";

interface StoriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: StoriesPageProps): Promise<Metadata> {
  const search = parseStoryListSearch(await searchParams);

  // A sorted or facet-filtered view is a different page from the default one,
  // so it never canonicalizes onto `/stories`; page 2 likewise canonicalizes to
  // itself rather than to page 1, and `?page=1` is never emitted at all.
  const canonicalPath =
    search.hasFilters || search.page > 1 || search.sort !== "recent"
      ? storyListHref(search, { page: search.page })
      : "/stories";
  const leaf = search.q ? `Stories matching "${search.q}"` : "Stories";
  const title =
    search.page > 1 ? `${leaf} – page ${search.page}` : leaf;

  // A facet-filtered or sorted view is useful to readers but thin and
  // unbounded for crawlers: noindex, and no canonical claim to make for it.
  const filtered = search.hasFilters || search.sort !== "recent";

  return buildPageMetadata({
    title,
    description: "Every published story in the Eagles Eye catalogue.",
    path: canonicalPath,
    canonical: filtered ? false : canonicalPath,
    noindex: filtered,
  });
}

export default async function StoriesPage({ searchParams }: StoriesPageProps) {
  const search = parseStoryListSearch(await searchParams);

  const [result, categories, tags] = await Promise.all([
    getPublishedStoryList({
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
          { name: "Stories" },
        ])}
      />
      <header className="max-w-2xl">
        <p className="label-micro text-primary">Read</p>
        <h1 className="mt-3 font-display text-display-lg text-ink text-balance">
          Stories
        </h1>
        <p className="mt-4 font-ui text-body text-ink-muted text-pretty">
          Every published story in the catalogue. Search by title, author or
          description, then narrow the list by category or tag.
        </p>
      </header>

      <StoryFilters search={search} categories={categories} tags={tags} />

      {result.total === 0 ? (
        <div className="mt-12">
          {search.hasFilters ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="No stories match these filters"
              description="Try a different search term, or clear the filters to see the whole catalogue."
              action={
                <ButtonLink href="/stories" variant="secondary">
                  Clear filters
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              title="No stories have been published yet"
              description="When the first story is published it will appear here. In the meantime, browse by category."
              action={
                <ButtonLink href="/categories" variant="secondary">
                  Browse categories
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
            buildHref={(target) => storyListHref(search, { page: target })}
            className="mt-12"
          />
        </div>
      )}
    </div>
  );
}
