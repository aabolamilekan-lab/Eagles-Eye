"use client";

import { useActionState, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteTagAction } from "@/actions/tag";
import { INITIAL_TAXONOMY_FORM_STATE } from "@/lib/taxonomy/form";

/**
 * Destructive tag action, kept apart from the form.
 *
 * Deleting a tag cascades its `StoryTag` joins, so it is allowed even while
 * attached; the dialog states how many stories lose the tag before the typed
 * confirmation is required. The Server Action re-checks the confirmation
 * (AGENTS.md sections 14 and 15).
 */
export function TagDangerZone({
  tagId,
  name,
  storyCount,
}: {
  tagId: string;
  name: string;
  storyCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteTagAction,
    INITIAL_TAXONOMY_FORM_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const confirmationError = state.fieldErrors?.confirmation?.[0];
  const generalError =
    state.status === "error" && !confirmationError ? state.message : undefined;

  const cascadeNote =
    storyCount > 0
      ? ` It is currently assigned to ${storyCount} ${
          storyCount === 1 ? "story" : "stories"
        }, which will lose the tag.`
      : "";

  return (
    <section className="mt-12 rounded-md border border-error/30 bg-error-surface/40 p-5">
      <h2 className="font-display text-heading-sm text-ink">Danger zone</h2>
      <p className="mt-2 max-w-2xl font-ui text-body-sm text-ink-muted text-pretty">
        Deleting permanently removes this tag and unassigns it from every
        story.{cascadeNote} This cannot be undone.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="danger"
          size="sm"
          leadingIcon={<Trash2 className="size-4" />}
          onClick={() => setOpen(true)}
        >
          Delete tag
        </Button>
        {generalError ? (
          <p role="alert" className="font-ui text-body-xs font-medium text-error">
            {generalError}
          </p>
        ) : null}
      </div>

      {/* The dialog collects the typed confirmation; the server re-checks it. */}
      <form ref={formRef} action={formAction} hidden>
        <input type="hidden" name="id" value={tagId} />
        <input type="hidden" name="confirmation" value={name} />
      </form>

      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => formRef.current?.requestSubmit()}
        title="Delete this tag?"
        body={
          <div className="flex flex-col gap-2">
            <p>
              This permanently deletes <strong>{name}</strong>.{cascadeNote} This
              cannot be undone.
            </p>
            {confirmationError ? (
              <p role="alert" className="font-medium text-error">
                {confirmationError}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Delete tag"
        confirmationPhrase={name}
        loading={pending}
      />
    </section>
  );
}
