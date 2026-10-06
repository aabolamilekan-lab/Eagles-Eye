import { cn } from "@/lib/cn";

/**
 * Skeleton placeholder.
 *
 * The shape mirrors the content it stands in for, so the layout does not jump
 * when real data arrives. `aria-hidden` plus a parent `aria-busy` means screen
 * readers are not read a wall of empty boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-surface-sunken", className)}
    />
  );
}

/** Text lines with a shorter final line, the shape of a real paragraph. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Mirrors StoryCard. */
export function SkeletonStoryCard() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-md border border-border bg-surface"
    >
      <Skeleton className="aspect-[3/2] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-4 w-11/12" />
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

export function SkeletonStoryGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading stories"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonStoryCard key={index} />
      ))}
    </div>
  );
}

/** Mirrors an admin table, including the header band. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="overflow-hidden rounded-md border border-border"
    >
      <div className="flex gap-4 border-b border-border bg-surface-sunken px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChapterList({ count = 5 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading chapters"
      className="flex flex-col divide-y divide-(--color-border)"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 py-4">
          <Skeleton className="size-6 shrink-0 rounded-sm" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-3 w-24 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the reading column, so the reader sees no shift on load. */
export function SkeletonProse() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading chapter"
      className="reading-column flex flex-col gap-6 py-16"
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-4/5" />
      <SkeletonText lines={14} />
    </div>
  );
}
