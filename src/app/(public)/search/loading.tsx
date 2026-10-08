import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Search loading skeleton.
 *
 * Mirrors the search header, the query field, the facet panel and the result
 * rows so the reader never reads "nothing found" while a query is still
 * resolving (search skill).
 */
export default function SearchLoading() {
  return (
    <div
      role="status"
      aria-label="Loading search"
      className="shell py-(--spacing-section)"
    >
      <header className="max-w-2xl">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-9 w-64" />
        <SkeletonText lines={2} className="mt-4 max-w-xl" />
      </header>

      <div className="mt-8 max-w-2xl">
        <Skeleton className="h-11 w-full rounded-md" />
      </div>

      <div className="mt-6">
        <Skeleton className="h-16 w-full rounded-md" />
      </div>

      <div className="mt-10">
        <Skeleton className="h-5 w-40" />

        <ul className="mt-6 flex max-w-3xl list-none flex-col divide-y divide-border">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex gap-4 py-5 first:pt-0 last:pb-0">
              <Skeleton className="size-20 shrink-0 rounded-sm sm:size-24" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="h-5 w-3/4" />
                <SkeletonText lines={2} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
