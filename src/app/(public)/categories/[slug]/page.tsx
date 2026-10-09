import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, type Crumb } from "@/components/navigation/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { StoryGrid } from "@/components/stories/StoryCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { getPublishedCategoryBySlug } from "@/lib/queries/public/categories";
import { getPublishedStoryList } from "@/lib/queries/public/stories";
import { parseContentSlug, parseStoryListSearch } from "@/lib/validation/story";
import { categoryStoryHref } from "@/lib/validation/taxonomy";
import {
  buildBreadcrumbJsonLd,
  buildCollectionPageJsonLd,
} from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Category detail.
 *
 * Only a category holding at least one published story resolves; every other
 * slug returns the same `notFound()` as an unknown one. The story list is
 * filtered to this category inside the shared public query layer, so a draft or
 * archived story can never appear (AGENTS.md section 6).
 */
export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "popular", label: "Most read" },
  { value: "title", label: "Title A–Z" },
];

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const slug = parseContentSlug((await params).slug);
  if (!slug) {
    notFound();
  }

  const category = await getPublishedCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  return buildPageMetadata({
    title: category.name,
    description:
      category.description ||
      `Published stories in the ${category.name} category on Eagles Eye.`,
    path: `/categories/${category.slug}`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const slug = parseContentSlug((await params).slug);
  if (!slug) {
    notFound();
  }

  const search = parseStoryListSearch(await searchParams);
  const [category, result] = await Promise.all([
    getPublishedCategoryBySlug(slug),
    getPublishedStoryList({
      q: "",
      category: slug,
      tags: [],
      sort: search.sort,
      page: search.page,
    }),
  ]);

  if (!category) {
    notFound();
  }

  const breadcrumbs: Crumb[] = [
    { label: "Home", href: "/" },
    { label: "Categories", href: "/categories" },
    { label: category.name },
  ];

  return (
    <div className="shell py-8 sm:py-12">
      <JsonLd
        data={buildCollectionPageJsonLd({
          name: category.name,
          slug: category.slug,
          description: category.description,
        })}
      />
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", url: "/" },
          { name: "Categories", url: "/categories" },
          { name: category.name },
        ])}
      />

      <Breadcrumbs items={breadcrumbs} />

      <header className="mt-6 border-b border-border/70 pb-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-surface px-3 py-1 font-ui text-body-xs font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Category Archive
          </span>
        </div>
        <h1 className="mt-4 font-display text-display-lg sm:text-display-xl text-ink tracking-tight text-balance">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-3 max-w-2xl font-ui text-body sm:text-body-read text-ink-muted text-pretty leading-relaxed">
            {category.description}
          </p>
        ) : null}
      </header>

      {result.total === 0 ? (
        <div className="mt-10 sm:mt-12">
          <EmptyState
            title="No published stories yet"
            description="No stories in this category are published. Check back soon."
          />
        </div>
      ) : (
        <div className="mt-8 sm:mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-5">
            <p className="font-ui text-body-sm text-ink-muted">
              Showing <span className="font-semibold text-ink">{result.total}</span> {result.total === 1 ? "story" : "stories"}
            </p>
            <form
              method="get"
              action={`/categories/${category.slug}`}
              className="flex items-end gap-2.5 sm:gap-3"
            >
              <div className="min-w-[140px] sm:min-w-[160px]">
                <SelectField
                  label="Sort by"
                  name="sort"
                  defaultValue={search.sort}
                  options={SORT_OPTIONS}
                />
              </div>
              <Button type="submit" variant="secondary" size="md" className="h-11 shrink-0">
                Apply
              </Button>
            </form>
          </div>

          <div className="mt-8">
            <StoryGrid stories={result.stories} />
          </div>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            totalItems={result.total}
            pageSize={result.pageSize}
            itemNoun="story"
            itemNounPlural="stories"
            showSummary={false}
            buildHref={(target) =>
              categoryStoryHref(category.slug, {
                sort: search.sort,
                page: target,
              })
            }
            className="mt-10 sm:mt-14"
          />
        </div>
      )}
    </div>
  );
}
