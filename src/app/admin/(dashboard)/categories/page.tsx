import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CategoryTable } from "@/components/admin/CategoryTable";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireCapability } from "@/lib/auth/guards";
import { queryAdminCategoryList } from "@/lib/queries/admin-taxonomy";
import { resolveCategoryNotice } from "@/lib/taxonomy/form";

export const dynamic = "force-dynamic";

interface AdminCategoriesPageProps {
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * Admin category list.
 *
 * The capability is re-checked here, not only in the layout (AGENTS.md section
 * 15). Counts show every story and the subset that is publicly visible.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: AdminCategoriesPageProps) {
  await requireCapability("categories.manage");

  const query = await searchParams;
  const notice = resolveCategoryNotice(query.notice);
  const categories = await queryAdminCategoryList();

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="Group stories into the sections readers browse."
        actions={
          <ButtonLink
            href="/admin/categories/new"
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="size-4" />}
          >
            New category
          </ButtonLink>
        }
      />

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      {categories.length === 0 ? (
        <EmptyState
          tone="admin"
          title="No categories yet"
          description="Create a category to group stories, then assign it from the story editor."
          action={
            <ButtonLink href="/admin/categories/new" variant="primary">
              New category
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className="mb-4 font-ui text-body-sm text-ink-muted">
            <span className="tabular-nums">{categories.length}</span>{" "}
            {categories.length === 1 ? "category" : "categories"}
          </p>
          <CategoryTable categories={categories} />
        </>
      )}
    </>
  );
}
