"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      headingLevel="h1"
      title="This admin page could not load"
      description="The problem was logged on the server. Try again, or return to the dashboard if it persists."
      action={
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
      }
    />
  );
}
