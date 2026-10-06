import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ChapterRows,
  type ChapterListItem,
} from "@/components/chapters/ChapterList";

/**
 * By-index chapter navigation for the reader.
 *
 * A native `<details>` disclosure, so expanded state and keyboard behaviour
 * come from the platform rather than from script. The rows are the same
 * `ChapterRows` the story table of contents uses, and the current chapter is
 * marked `aria-current="page"` by that component.
 */
export function ChapterIndex({
  storySlug,
  chapters,
  className,
}: {
  storySlug: string;
  chapters: ChapterListItem[];
  className?: string;
}) {
  if (chapters.length === 0) {
    return null;
  }

  return (
    <details
      className={cn(
        "group rounded-md border border-border bg-surface",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-ui text-body-sm text-ink transition-colors hover:bg-surface-sunken">
        <span>All chapters</span>
        <span className="flex items-center gap-2 font-ui text-body-xs tabular-nums text-ink-subtle">
          {chapters.length}
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform duration-(--duration-fast) group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="border-t border-border px-4">
        <ChapterRows storySlug={storySlug} chapters={chapters} />
      </div>
    </details>
  );
}
