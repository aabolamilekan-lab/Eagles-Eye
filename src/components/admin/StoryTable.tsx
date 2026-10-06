import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { formatPublishedDate } from "@/lib/format";
import type { AdminStoryListRow } from "@/lib/queries/admin-stories";

/**
 * Admin story list.
 *
 * A real table with a per-row link to the editor. Published stories link to
 * their public page only when they actually have a published chapter, so the
 * link never opens a page that hides itself.
 */
export function StoryTable({ stories }: { stories: AdminStoryListRow[] }) {
  return (
    <Table caption="Stories">
      <TableHead>
        <TableHeaderCell>Story</TableHeaderCell>
        <TableHeaderCell>Status</TableHeaderCell>
        <TableHeaderCell>Category</TableHeaderCell>
        <TableHeaderCell align="right">Chapters</TableHeaderCell>
        <TableHeaderCell>Updated</TableHeaderCell>
        <TableHeaderCell align="right">Actions</TableHeaderCell>
      </TableHead>

      <TableBody>
        {stories.map((story) => {
          const isPublic =
            story.status === "PUBLISHED" && story.publishedChapterCount > 0;

          return (
            <TableRow key={story.id}>
              <TableCell header>
                <Link
                  href={`/admin/stories/${story.id}/edit`}
                  className="font-medium text-ink underline-offset-4 hover:underline"
                >
                  {story.title}
                </Link>
                <span className="mt-0.5 block font-mono text-body-xs text-ink-subtle">
                  /{story.slug}
                </span>
              </TableCell>

              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={story.status} />
                  {story.featured ? <Badge tone="accent">Featured</Badge> : null}
                </div>
              </TableCell>

              <TableCell>{story.category?.name ?? "—"}</TableCell>

              <TableCell align="right">
                {story.publishedChapterCount}/{story.chapterCount}
              </TableCell>

              <TableCell>{formatPublishedDate(story.updatedAt) ?? "—"}</TableCell>

              <TableCell align="right">
                <div className="flex justify-end gap-2">
                  {isPublic ? (
                    <ButtonLink
                      href={`/stories/${story.slug}`}
                      size="sm"
                      variant="ghost"
                    >
                      View
                    </ButtonLink>
                  ) : null}
                  <ButtonLink
                    href={`/admin/stories/${story.id}/edit`}
                    size="sm"
                    variant="secondary"
                  >
                    Edit
                  </ButtonLink>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
