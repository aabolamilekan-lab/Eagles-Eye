import { Skeleton } from "@/components/ui/Skeleton";

export default function CategoriesLoading() {
  return (
    <div className="shell py-(--spacing-section)">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-4 h-10 w-56" />
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-md" />
        ))}
      </div>
    </div>
  );
}
