"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";

export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <div className="shell py-(--spacing-section)">
      <ErrorState
        headingLevel="h1"
        action={
          <Button variant="secondary" onClick={() => reset()}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
