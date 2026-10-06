import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { TagTable } from "@/components/admin/TagTable";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireCapability } from "@/lib/auth/guards";
import { queryAdminTagList } from "@/lib/queries/admin-taxonomy";
import { resolveTagNotice } from "@/lib/taxonomy/form";

export const dynamic = "force-dynamic";

interface AdminTagsPageProps {
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * Admin tag list.
 *
 * The capability is re-checked here, not only in the layout (AGENTS.md section
 * 15). Counts show every story and the subset that is publicly visible.
 */
export default async function AdminTagsPage({
  searchParams,
}: AdminTagsPageProps) {
  await requireCapability("tags.manage");

  const query = await searchParams;
  const notice = resolveTagNotice(query.notice);
  const tags = await queryAdminTagList();

  return (
    <>
      <AdminPageHeader
        title="Tags"
        description="Label stories so readers can find related work."
        actions={
          <ButtonLink
            href="/admin/tags/new"
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="size-4" />}
          >
            New tag
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

      {tags.length === 0 ? (
        <EmptyState
          tone="admin"
          title="No tags yet"
          description="Create a tag, then assign it to stories from the story editor."
          action={
            <ButtonLink href="/admin/tags/new" variant="primary">
              New tag
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className="mb-4 font-ui text-body-sm text-ink-muted">
            <span className="tabular-nums">{tags.length}</span>{" "}
            {tags.length === 1 ? "tag" : "tags"}
          </p>
          <TagTable tags={tags} />
        </>
      )}
    </>
  );
}
