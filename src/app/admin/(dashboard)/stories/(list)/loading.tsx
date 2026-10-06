import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function AdminStoriesLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-48" />
      <SkeletonTable />
    </div>
  );
}
