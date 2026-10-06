import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
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
import type { RecentStory } from "@/lib/queries/admin/stats";

/** The most recently updated stories, with publication readiness at a glance. */
export function RecentStoriesSection({ stories }: { stories: RecentStory[] }) {
  return (
    <section aria-labelledby="recent-stories">
      <SectionHeading
        id="recent-stories"
        title="Recent stories"
        action={
          <Link
            href="/admin/stories"
            className="font-ui text-body-sm text-accent underline-offset-4 hover:underline"
          >
            All stories
          </Link>
        }
      />

      {stories.length === 0 ? (
        <EmptyState
          tone="admin"
          icon={<BookOpen className="size-6" />}
          title="No stories yet"
          description="A story holds its chapters. Create one to begin, then publish it to make it visible to readers."
          action={
            <ButtonLink
              href="/admin/stories/new"
              variant="primary"
              size="sm"
              leadingIcon={<Plus className="size-4" />}
            >
              New story
            </ButtonLink>
          }
        />
      ) : (
        <Table caption="Recently updated stories, newest first">
          <TableHead>
            <TableHeaderCell>Story</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell align="right">Chapters</TableHeaderCell>
            <TableHeaderCell>Updated</TableHeaderCell>
          </TableHead>
          <TableBody>
            {stories.map((story) => (
              <TableRow key={story.id}>
                <TableCell header>
                  <Link
                    href={`/admin/stories/${story.id}/edit`}
                    className="font-medium text-ink underline-offset-4 hover:text-accent hover:underline"
                  >
                    {story.title}
                  </Link>
                  <span className="mt-0.5 block font-ui text-body-xs text-ink-subtle">
                    {story.category ? story.category.name : "Uncategorised"}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={story.status} />
                </TableCell>
                <TableCell align="right">
                  {story.publishedChapterCount}
                  <span className="text-ink-subtle"> / {story.chapterCount}</span>
                </TableCell>
                <TableCell>
                  <time dateTime={story.updatedAt.toISOString()}>
                    {formatPublishedDate(story.updatedAt)}
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
