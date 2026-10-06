import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StoryDangerZone } from "@/components/admin/StoryDangerZone";
import { StoryEditor } from "@/components/admin/StoryEditor";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import {
  getAdminStoryById,
  getStoryFormOptions,
} from "@/lib/queries/admin-stories";
import { getUploadSettings } from "@/lib/storage/settings";
import { resolveStoryNotice } from "@/lib/stories/notices";

export const dynamic = "force-dynamic";

interface AdminEditStoryPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * Edit a story.
 *
 * Not inside a `loading.tsx` boundary, so an unknown id returns a real 404
 * rather than a streamed 200. Content and status changes share one form and one
 * Server Action; publishing, archiving and deletion are re-checked server-side.
 */
export default async function AdminEditStoryPage({
  params,
  searchParams,
}: AdminEditStoryPageProps) {
  await requireCapability("stories.manage");

  const { id } = await params;
  const story = await getAdminStoryById(id);
  if (!story) {
    notFound();
  }

  const [options, notice, upload] = await Promise.all([
    getStoryFormOptions(),
    searchParams.then((query) => resolveStoryNotice(query.notice)),
    getUploadSettings(),
  ]);

  return (
    <>
      <AdminPageHeader
        title={story.title}
        description="Update the story's details. Saving keeps it as it is; the publishing controls change who can see it."
        meta={<StatusBadge status={story.status} />}
        actions={
          <ButtonLink
            href={`/admin/stories/${story.id}/chapters`}
            variant="secondary"
            size="sm"
          >
            Chapters
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

      <StoryEditor
        key={story.updatedAt.getTime()}
        mode="edit"
        story={story}
        categories={options.categories}
        tags={options.tags}
        upload={upload}
      />

      <StoryDangerZone storyId={story.id} title={story.title} />
    </>
  );
}
