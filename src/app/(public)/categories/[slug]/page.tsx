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
    <div className="shell py-(--spacing-section)">
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

      <header className="mt-6 max-w-2xl">
        <p className="label-micro text-primary">Category</p>
        <h1 className="mt-3 font-display text-display-lg text-ink text-balance">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-4 font-ui text-body text-ink-muted text-pretty">
            {category.description}
          </p>
        ) : null}
      </header>

      {result.total === 0 ? (
        <div className="mt-12">
          <EmptyState
            title="No published stories yet"
            description="No stories in this category are published. Check back soon."
          />
        </div>
      ) : (
        <div className="mt-10">
          <div className="flex flex-wrap items-end justify-end gap-4">
            <form
              method="get"
              action={`/categories/${category.slug}`}
              className="flex items-end gap-3"
            >
              <SelectField
                label="Sort"
                name="sort"
                defaultValue={search.sort}
                options={SORT_OPTIONS}
              />
              <Button type="submit" variant="secondary" size="sm">
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
            className="mt-12"
          />
        </div>
      )}
    </div>
  );
}
