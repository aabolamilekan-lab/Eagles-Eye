import { Skeleton, SkeletonStoryGrid } from "@/components/ui/Skeleton";

export default function StoriesLoading() {
  return (
    <div className="shell py-(--spacing-section)">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-4 h-10 w-48" />
      <Skeleton className="mt-8 h-5 w-full max-w-md" />

      <div className="mt-10 rounded-md border border-border bg-surface p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <Skeleton className="mt-6 h-9 w-36" />
      </div>

      <div className="mt-12">
        <SkeletonStoryGrid count={6} />
      </div>
    </div>
  );
}
