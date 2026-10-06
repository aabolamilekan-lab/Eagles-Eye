import { DashboardPanel } from "@/components/admin/DashboardPanel";
import { cn } from "@/lib/cn";
import type { StatusBreakdown } from "@/lib/queries/admin/stats";

const ROWS = [
  { key: "published", label: "Published", tone: "bg-success" },
  { key: "draft", label: "Drafts", tone: "bg-ink-subtle" },
  { key: "archived", label: "Archived", tone: "bg-warning" },
] as const;

/**
 * Publication status, counted from the database.
 *
 * The bars are a proportion of a real total, never an invented trend; the count
 * is always printed alongside so the bar is decoration, not the only signal.
 */
export function PublicationStats({
  stories,
  chapters,
  categories,
  tags,
  storiesPublishedThisYear,
  chaptersPublishedThisYear,
  storiesUnreadable,
  year,
}: {
  stories: StatusBreakdown;
  chapters: StatusBreakdown;
  categories: number;
  tags: number;
  storiesPublishedThisYear: number;
  chaptersPublishedThisYear: number;
  storiesUnreadable: number;
  year: number;
}) {
  return (
    <DashboardPanel
      title="Publication"
      description="Where the catalogue stands right now."
    >
      <div className="flex flex-col gap-6 p-5">
        <Breakdown label="Stories" breakdown={stories} />
        <Breakdown label="Chapters" breakdown={chapters} />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-4">
          <Metric
            label={`Stories published in ${year}`}
            value={storiesPublishedThisYear}
          />
          <Metric
            label={`Chapters published in ${year}`}
            value={chaptersPublishedThisYear}
          />
          <Metric label="Categories" value={categories} />
          <Metric label="Tags" value={tags} />
        </dl>

        {storiesUnreadable > 0 ? (
          <p
            role="note"
            className="rounded-sm border border-warning/30 bg-warning-surface px-3 py-2 font-ui text-body-xs text-warning"
          >
            {storiesUnreadable === 1
              ? "1 published story has no published chapter and cannot be read."
              : `${storiesUnreadable} published stories have no published chapter and cannot be read.`}
          </p>
        ) : null}
      </div>
    </DashboardPanel>
  );
}

function Breakdown({
  label,
  breakdown,
}: {
  label: string;
  breakdown: StatusBreakdown;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="label-micro text-ink-subtle">{label}</h3>
        <span className="font-ui text-body-xs tabular-nums text-ink-muted">
          {breakdown.total} total
        </span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {ROWS.map((row) => {
          const count = breakdown[row.key];
          const percent =
            breakdown.total === 0
              ? 0
              : Math.round((count / breakdown.total) * 100);

          return (
            <li key={row.key} className="flex items-center gap-3">
              <span className="w-16 shrink-0 font-ui text-body-xs text-ink-muted">
                {row.label}
              </span>
              <span
                aria-hidden="true"
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken"
              >
                <span
                  className={cn("block h-full rounded-full", row.tone)}
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right font-ui text-body-xs tabular-nums text-ink">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-ui text-body-xs text-ink-subtle">{label}</dt>
      <dd className="font-display text-heading-md text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}
