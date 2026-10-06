import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ChapterEditor } from "@/components/admin/ChapterEditor";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import { getAdminStoryById } from "@/lib/queries/admin-stories";

export const dynamic = "force-dynamic";

interface AdminNewChapterPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Create a chapter.
 *
 * New chapters are always saved as a draft; publishing is a separate
 * transition, so an unfinished story can never gain a live chapter by accident.
 */
export default async function AdminNewChapterPage({
  params,
}: AdminNewChapterPageProps) {
  await requireCapability("chapters.manage");

  const { id } = await params;
  const story = await getAdminStoryById(id);
  if (!story) {
    notFound();
  }

  return (
    <>
      <AdminPageHeader
        title="New chapter"
        description={`Add a chapter to “${story.title}”. It is saved as a draft until you publish it.`}
        actions={
          <ButtonLink
            href={`/admin/stories/${story.id}/chapters`}
            variant="ghost"
            size="sm"
          >
            Back to chapters
          </ButtonLink>
        }
      />

      <ChapterEditor mode="create" storyId={story.id} storyTitle={story.title} />
    </>
  );
}
