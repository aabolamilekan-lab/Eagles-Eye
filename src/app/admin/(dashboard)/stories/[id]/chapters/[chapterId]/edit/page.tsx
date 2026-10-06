import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ChapterDangerZone } from "@/components/admin/ChapterDangerZone";
import { ChapterEditor } from "@/components/admin/ChapterEditor";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import { getAdminStoryById } from "@/lib/queries/admin-stories";
import { getAdminChapterById } from "@/lib/queries/admin-chapters";
import { resolveChapterNotice } from "@/lib/chapters/notices";

export const dynamic = "force-dynamic";

interface AdminEditChapterPageProps {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * Edit a chapter.
 *
 * Not inside a `loading.tsx` boundary, so a chapter id that does not belong to
 * this story returns a real 404 rather than a streamed 200. Content, position
 * and status share one form; the Server Action re-checks the position change,
 * the transition table and the sanitizer.
 */
export default async function AdminEditChapterPage({
  params,
  searchParams,
}: AdminEditChapterPageProps) {
  await requireCapability("chapters.manage");

  const { id, chapterId } = await params;
  const story = await getAdminStoryById(id);
  if (!story) {
    notFound();
  }

  const chapter = await getAdminChapterById(id, chapterId);
  if (!chapter) {
    notFound();
  }

  const notice = resolveChapterNotice((await searchParams).notice);

  // Positions include the chapter's own number plus one, so a story whose count
  // is stale still offers a valid "append to the end" choice.
  const positionCount = Math.max(story.chapterCount, chapter.chapterNumber) + 1;
  const positions = Array.from({ length: positionCount }, (_, index) => index + 1);

  return (
    <>
      <AdminPageHeader
        title={chapter.title}
        description={`Edit this chapter of “${story.title}”. Saving keeps its status; the publishing controls change who can see it.`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={chapter.status} />
            <span className="font-ui text-body-xs text-ink-muted">
              Position {chapter.chapterNumber}
            </span>
          </div>
        }
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

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      <ChapterEditor
        key={chapter.updatedAt.getTime()}
        mode="edit"
        storyId={story.id}
        storyTitle={story.title}
        chapter={chapter}
        positions={positions}
      />

      <ChapterDangerZone
        storyId={story.id}
        chapterId={chapter.id}
        title={chapter.title}
      />
    </>
  );
}
