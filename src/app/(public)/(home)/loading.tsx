import { Skeleton, SkeletonStoryGrid, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Public loading skeleton.
 *
 * Mirrors the home composition: hero, featured block, recent grid, popular
 * rows, then the category grid. The shapes match the real content's dimensions
 * so nothing shifts when the streamed page arrives — loading, empty, and error
 * stay three visually distinct states (ui-ux skill).
 */
export default function PublicLoading() {
  return (
    <div
      role="status"
      aria-label="Loading the catalogue"
      className="flex flex-col"
    >
      <section className="shell grid gap-12 pt-(--spacing-section) pb-(--spacing-section-sm) lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
        <div className="flex flex-col justify-center">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-9 w-full max-w-2xl" />
          <Skeleton className="mt-3 h-9 w-4/5 max-w-xl" />
          <div className="mt-5 max-w-xl">
            <SkeletonText lines={2} />
          </div>
          <div className="mt-8 flex gap-3">
            <Skeleton className="h-12 w-40 rounded-md" />
            <Skeleton className="h-12 w-44 rounded-md" />
          </div>
          <div className="mt-10 flex gap-12 border-t border-border pt-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:pt-4">
          <div className="rounded-md border border-border bg-surface p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-5 h-11 w-full rounded-sm" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>
      </section>

      <section className="shell pb-(--spacing-section)">
        <div className="mb-6 flex items-end justify-between border-b border-border pb-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="grid overflow-hidden rounded-md border border-border md:grid-cols-[1.15fr_1fr]">
          <Skeleton className="aspect-[4/3] w-full rounded-none md:aspect-auto md:min-h-80" />
          <div className="flex flex-col justify-center gap-4 p-6 sm:p-8 lg:p-10">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-5/6" />
            <SkeletonText lines={3} />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </section>

      <section className="shell pb-(--spacing-section)">
        <div className="mb-6 flex items-end justify-between border-b border-border pb-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <SkeletonStoryGrid count={6} />
      </section>

      <section className="shell pb-(--spacing-section)">
        <div className="mb-6 border-b border-border pb-3">
          <Skeleton className="h-7 w-48" />
        </div>
        <ul className="flex max-w-3xl list-none flex-col divide-y divide-border">
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
      </section>

      <section className="shell pb-(--spacing-section)">
        <div className="mb-6 border-b border-border pb-3">
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5"
            >
              <Skeleton className="h-4 w-1/2" />
              <SkeletonText lines={2} />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
