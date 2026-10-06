import Link from "next/link";
import { FileText } from "lucide-react";
import { SectionHeading } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
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
import type { RecentChapter } from "@/lib/queries/admin/stats";

/** The most recently updated chapters, grouped back to their story. */
export function RecentChaptersSection({
  chapters,
}: {
  chapters: RecentChapter[];
}) {
  return (
    <section aria-labelledby="recent-chapters">
      <SectionHeading
        id="recent-chapters"
        title="Recent chapters"
        action={
          <Link
            href="/admin/stories"
            className="font-ui text-body-sm text-accent underline-offset-4 hover:underline"
          >
            All stories
          </Link>
        }
      />

      {chapters.length === 0 ? (
        <EmptyState
          tone="admin"
          icon={<FileText className="size-6" />}
          title="No chapters yet"
          description="Chapters belong to a story. Open a story to add and publish its first chapter."
          action={
            <ButtonLink href="/admin/stories" variant="primary" size="sm">
              Go to stories
            </ButtonLink>
          }
        />
      ) : (
        <Table caption="Recently updated chapters, newest first">
          <TableHead>
            <TableHeaderCell>Chapter</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell align="right">Number</TableHeaderCell>
            <TableHeaderCell>Updated</TableHeaderCell>
          </TableHead>
          <TableBody>
            {chapters.map((chapter) => (
              <TableRow key={chapter.id}>
                <TableCell header>
                  <Link
                    href={`/admin/stories/${chapter.story.id}/chapters/${chapter.id}/edit`}
                    className="font-medium text-ink underline-offset-4 hover:text-accent hover:underline"
                  >
                    {chapter.title}
                  </Link>
                  <span className="mt-0.5 block font-ui text-body-xs text-ink-subtle">
                    {chapter.story.title}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={chapter.status} />
                </TableCell>
                <TableCell align="right">{chapter.chapterNumber}</TableCell>
                <TableCell>
                  <time dateTime={chapter.updatedAt.toISOString()}>
                    {formatPublishedDate(chapter.updatedAt)}
                  </time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
