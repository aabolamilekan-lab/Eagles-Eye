import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ChapterOrderList } from "@/components/admin/ChapterOrderList";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireCapability } from "@/lib/auth/guards";
import { getAdminStoryById } from "@/lib/queries/admin-stories";
import { queryAdminChapterList } from "@/lib/queries/admin-chapters";
import { resolveChapterNotice } from "@/lib/chapters/notices";

export const dynamic = "force-dynamic";

interface AdminStoryChaptersPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}

/**
 * List a story's chapters.
 *
 * All statuses are visible here; reordering is a whole-list mutation and the
 * reorder validates against the stored id set server-side. Not inside a
 * `loading.tsx` boundary, so an unknown story id returns a real 404.
 */
export default async function AdminStoryChaptersPage({
  params,
  searchParams,
}: AdminStoryChaptersPageProps) {
  await requireCapability("chapters.manage");

  const { id } = await params;
  const story = await getAdminStoryById(id);
  if (!story) {
    notFound();
  }

  const [list, notice] = await Promise.all([
    queryAdminChapterList(id),
    searchParams.then((query) => resolveChapterNotice(query.notice)),
  ]);

  const newChapterHref = `/admin/stories/${story.id}/chapters/new`;

  return (
    <>
      <AdminPageHeader
        title="Chapters"
        description={`Order, edit and publish the chapters of “${story.title}”.`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={story.status} />
            <span className="font-ui text-body-xs text-ink-muted">
              {list.total} {list.total === 1 ? "chapter" : "chapters"} ·{" "}
              {list.publishedCount} published
            </span>
          </div>
        }
        actions={
          <>
            <ButtonLink
              href={`/admin/stories/${story.id}/edit`}
              variant="ghost"
              size="sm"
            >
              Back to story
            </ButtonLink>
            <ButtonLink href={newChapterHref} variant="primary" size="sm">
              New chapter
            </ButtonLink>
          </>
        }
      />

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      {list.total === 0 ? (
        <EmptyState
          tone="admin"
          title="No chapters yet"
          description="The story is already visible in the catalogue. Add and publish a chapter so readers can start reading."
          action={
            <ButtonLink href={newChapterHref} variant="primary">
              New chapter
            </ButtonLink>
          }
        />
      ) : (
        <ChapterOrderList
          key={list.chapters
            .map((chapter) => `${chapter.id}:${chapter.chapterNumber}`)
            .join("|")}
          storyId={story.id}
          chapters={list.chapters}
        />
      )}
    </>
  );
}
