import { ButtonLink } from "@/components/ui/Button";
import { NotFoundState } from "@/components/ui/EmptyState";

export default function PublicNotFound() {
  return (
    <div className="shell py-24">
      <NotFoundState
        title="Page not found"
        description="This page does not exist, or the story it points to is not published. Drafts and archived stories are never shown to readers."
        action={
          <ButtonLink href="/stories" variant="secondary">
            Back to all stories
          </ButtonLink>
        }
      />
    </div>
  );
}
