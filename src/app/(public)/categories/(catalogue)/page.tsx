import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { CategoryCard } from "@/components/stories/CategoryCard";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { getPublishedCategoryPage } from "@/lib/queries/public/categories";
import {
  categoriesIndexHref,
  parseCategoryPage,
} from "@/lib/validation/taxonomy";
import { buildBreadcrumbJsonLd } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";

interface CategoriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DESCRIPTION = "Browse published stories by category.";

/**
 * Page-aware canonical: page 2 points at itself rather than at page 1, so a
 * paginated slice is never collapsed onto the index entry.
 */
export async function generateMetadata({
  searchParams,
}: CategoriesPageProps): Promise<Metadata> {
  const page = parseCategoryPage((await searchParams).page);

  return buildPageMetadata({
    title: "Categories",
    description: DESCRIPTION,
    path: page > 1 ? categoriesIndexHref(page) : "/categories",
  });
}

/**
 * Category index.
 *
 * Only categories holding at least one published story appear, and the count is
 * published-only, both enforced inside the shared query layer (AGENTS.md section
 * 6). Paginated, so the list is never unbounded.
 */
export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const page = parseCategoryPage((await searchParams).page);
  const result = await getPublishedCategoryPage(page);

  return (
    <div className="shell py-(--spacing-section)">
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", url: "/" },
          { name: "Categories" },
        ])}
      />
      <header className="max-w-2xl">
        <p className="label-micro text-primary">Browse</p>
        <h1 className="mt-3 font-display text-display-lg text-ink text-balance">
          Categories
        </h1>
        <p className="mt-4 font-ui text-body text-ink-muted text-pretty">
          Stories grouped by category, so readers can follow a subject.
        </p>
      </header>

      {result.total === 0 ? (
        <div className="mt-12">
          <EmptyState
            title="No categories yet"
            description="Categories appear here once a published story is assigned to one."
            action={
              <ButtonLink href="/stories" variant="secondary">
                Browse all stories
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="mt-12">
          <h2 className="sr-only">All categories</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.categories.map((category) => (
              <CategoryCard
                key={category.slug}
                category={category}
                storyCount={category.storyCount}
              />
            ))}
          </div>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            totalItems={result.total}
            pageSize={result.pageSize}
            itemNoun="category"
            itemNounPlural="categories"
            buildHref={categoriesIndexHref}
            className="mt-12"
          />
        </div>
      )}
    </div>
  );
}
