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
      className="shell py-8 sm:py-12 md:py-16"
    >
      <header className="max-w-2xl">
        <Skeleton className="h-3.5 w-24 rounded-full" />
        <Skeleton className="mt-3 h-9 sm:h-11 w-64 rounded-md" />
        <SkeletonText lines={2} className="mt-3 max-w-xl" />
      </header>

      <div className="mt-8 max-w-2xl">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      <div className="mt-6">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-44 rounded-md" />

        <ul className="mt-6 flex list-none flex-col divide-y divide-border/60">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex gap-4 py-6 first:pt-0 last:pb-0">
              <Skeleton className="size-20 shrink-0 rounded-md sm:size-24" />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="h-5 w-3/4 rounded-sm" />
                <SkeletonText lines={2} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
