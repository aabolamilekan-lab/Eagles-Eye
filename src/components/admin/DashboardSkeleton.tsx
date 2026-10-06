import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Dashboard loading state. Mirrors the real layout so the page does not jump
 * when the counts arrive.
 */
export function DashboardSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading dashboard"
      className="flex flex-col gap-10"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-md" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="mb-6 h-9 w-48" />
          <SkeletonTable rows={5} columns={4} />
        </div>
        <Skeleton className="h-72 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="mb-6 h-9 w-48" />
          <SkeletonTable rows={5} columns={4} />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-52 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </div>
      </div>
    </div>
  );
}
