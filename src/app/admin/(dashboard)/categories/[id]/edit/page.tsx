import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CategoryDangerZone } from "@/components/admin/CategoryDangerZone";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import { getAdminCategoryById } from "@/lib/queries/admin-taxonomy";
import { resolveCategoryNotice } from "@/lib/taxonomy/form";

export const dynamic = "force-dynamic";

interface AdminEditCategoryPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * Edit a category.
 *
 * Not inside a `loading.tsx` boundary, so an unknown id returns a real 404
 * rather than a streamed 200. The danger zone refuses to delete a category that
 * still holds stories.
 */
export default async function AdminEditCategoryPage({
  params,
  searchParams,
}: AdminEditCategoryPageProps) {
  await requireCapability("categories.manage");

  const { id } = await params;
  const category = await getAdminCategoryById(id);
  if (!category) {
    notFound();
  }

  const notice = resolveCategoryNotice((await searchParams).notice);

  return (
    <>
      <AdminPageHeader
        title={category.name}
        description="Update the category. Saving keeps its stories attached; changing the web address changes its public URL."
        meta={
          <span className="font-mono text-body-xs text-ink-subtle">
            /{category.slug}
          </span>
        }
        actions={
          category.publishedStoryCount > 0 ? (
            <ButtonLink
              href={`/categories/${category.slug}`}
              variant="secondary"
              size="sm"
            >
              View public page
            </ButtonLink>
          ) : undefined
        }
      />

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      <CategoryForm key={category.slug} mode="edit" category={category} />

      <CategoryDangerZone
        categoryId={category.id}
        name={category.name}
        storyCount={category.storyCount}
      />
    </>
  );
}
