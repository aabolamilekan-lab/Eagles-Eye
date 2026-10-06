import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { requireCapability } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Create a category.
 *
 * The Server Action re-checks the capability, validates, and rejects a name
 * that already exists. The slug is derived from the name server-side.
 */
export default async function AdminNewCategoryPage() {
  await requireCapability("categories.manage");

  return (
    <>
      <AdminPageHeader
        title="New category"
        description="Give the category a name. A web address is generated for you unless you enter one."
      />
      <CategoryForm mode="create" />
    </>
  );
}
