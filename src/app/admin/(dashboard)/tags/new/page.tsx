import { AdminPageHeader } from "@/components/admin/AdminShell";
import { TagForm } from "@/components/admin/TagForm";
import { requireCapability } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Create a tag.
 *
 * The Server Action re-checks the capability, validates, and rejects a name
 * that already exists. The slug is derived from the name server-side.
 */
export default async function AdminNewTagPage() {
  await requireCapability("tags.manage");

  return (
    <>
      <AdminPageHeader
        title="New tag"
        description="Give the tag a name. A web address is generated for you unless you enter one."
      />
      <TagForm mode="create" />
    </>
  );
}
