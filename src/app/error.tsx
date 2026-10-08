"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";

export default function RootError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="shell flex flex-1 items-center justify-center py-24">
      <ErrorState
        headingLevel="h1"
        action={
          <Button variant="secondary" onClick={() => reset()}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
