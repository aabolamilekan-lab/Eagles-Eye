import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { TagDangerZone } from "@/components/admin/TagDangerZone";
import { TagForm } from "@/components/admin/TagForm";
import { Alert } from "@/components/ui/Alert";
import { requireCapability } from "@/lib/auth/guards";
import { getAdminTagById } from "@/lib/queries/admin-taxonomy";
import { resolveTagNotice } from "@/lib/taxonomy/form";

export const dynamic = "force-dynamic";

interface AdminEditTagPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * Edit a tag.
 *
 * Not inside a `loading.tsx` boundary, so an unknown id returns a real 404
 * rather than a streamed 200. Deleting cascades the `StoryTag` joins, which the
 * danger zone states before asking for confirmation.
 */
export default async function AdminEditTagPage({
  params,
  searchParams,
}: AdminEditTagPageProps) {
  await requireCapability("tags.manage");

  const { id } = await params;
  const tag = await getAdminTagById(id);
  if (!tag) {
    notFound();
  }

  const notice = resolveTagNotice((await searchParams).notice);

  return (
    <>
      <AdminPageHeader
        title={tag.name}
        description="Rename the tag or change its web address. Existing story assignments are kept."
        meta={
          <span className="font-mono text-body-xs text-ink-subtle">
            /{tag.slug}
          </span>
        }
      />

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      <TagForm key={tag.slug} mode="edit" tag={tag} />

      <TagDangerZone
        tagId={tag.id}
        name={tag.name}
        storyCount={tag.storyCount}
      />
    </>
  );
}
