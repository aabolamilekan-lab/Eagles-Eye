import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

export default function AdminSettingsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading settings"
      className="flex flex-col"
    >
      <div className="mb-8 flex flex-col gap-3 border-b border-border pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-surface p-5">
          <SkeletonText lines={4} />
        </div>
        <div className="rounded-md border border-border bg-surface p-5">
          <SkeletonText lines={4} />
        </div>
      </div>
    </div>
  );
}