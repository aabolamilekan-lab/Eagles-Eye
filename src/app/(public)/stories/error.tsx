"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";

export default function StoriesError({ reset }: { reset: () => void }) {
  return (
    <div className="shell py-(--spacing-section)">
      <ErrorState
        headingLevel="h1"
        title="We could not load the stories"
        description="Something went wrong while loading the catalogue. Try again, or return to the home page."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => reset()}>
              Try again
            </Button>
            <ButtonLink href="/" variant="ghost">
              Go home
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
