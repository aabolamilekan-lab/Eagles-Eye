import Link from "next/link";
import { EyeOff } from "lucide-react";
import { DashboardPanel } from "@/components/admin/DashboardPanel";
import { formatPublishedDate } from "@/lib/format";
import type { RecentView } from "@/lib/queries/admin/stats";

/**
 * Recent anonymous view records.
 *
 * `StoryView` holds individual view events; `Story.views` is a separate running
 * counter. Both are real and are kept distinct rather than reconciled.
 */
export function DashboardActivity({
  views,
  recordedViews,
}: {
  views: RecentView[];
  recordedViews: number;
}) {
  return (
    <DashboardPanel
      title="Recent activity"
      description="Anonymous view records, newest first."
      footer={
        <p className="font-ui text-body-xs text-ink-muted">
          <span className="tabular-nums">{recordedViews}</span>{" "}
          {recordedViews === 1 ? "recorded view event" : "recorded view events"}{" "}
          on file.
        </p>
      }
    >
      {views.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <EyeOff aria-hidden="true" className="size-5 text-ink-subtle" />
          <p className="font-ui text-body-sm text-ink-muted text-pretty">
            No views recorded yet. Activity appears here as readers open
            published chapters.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {views.map((view) => (
            <li key={view.id} className="flex flex-col gap-1 px-5 py-3">
              <Link
                href={`/admin/stories/${view.story.id}/edit`}
                className="font-ui text-body-sm font-medium text-ink underline-offset-4 hover:text-accent hover:underline"
              >
                {view.story.title}
              </Link>
              {view.chapter ? (
                <span className="font-ui text-body-xs text-ink-muted">
                  {view.chapter.title}
                </span>
              ) : null}
              <time
                dateTime={view.viewedAt.toISOString()}
                className="font-ui text-body-xs text-ink-subtle"
              >
                {formatPublishedDate(view.viewedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
