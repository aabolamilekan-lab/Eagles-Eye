"use client";

import { useActionState, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteChapterAction } from "@/actions/chapter";
import { INITIAL_CHAPTER_FORM_STATE } from "@/lib/chapters/form";

/**
 * Destructive chapter action, kept apart from the editor's normal controls.
 *
 * Deletion renumbers the remaining chapters in the same transaction, so it is
 * irreversible and lives in its own form and visually distinct region, behind a
 * typed confirmation the Server Action re-checks.
 */
export function ChapterDangerZone({
  storyId,
  chapterId,
  title,
}: {
  storyId: string;
  chapterId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteChapterAction,
    INITIAL_CHAPTER_FORM_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const confirmationError = state.fieldErrors?.confirmation?.[0];
  const generalError =
    state.status === "error" && !confirmationError ? state.message : undefined;

  return (
    <section className="mt-12 rounded-md border border-error/30 bg-error-surface/40 p-5">
      <h2 className="font-display text-heading-sm text-ink">Danger zone</h2>
      <p className="mt-2 max-w-2xl font-ui text-body-sm text-ink-muted text-pretty">
        Deleting permanently removes this chapter and renumbers the chapters
        after it. This cannot be undone.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="danger"
          size="sm"
          leadingIcon={<Trash2 className="size-4" />}
          onClick={() => setOpen(true)}
        >
          Delete chapter
        </Button>
        {generalError ? (
          <p role="alert" className="font-ui text-body-xs font-medium text-error">
            {generalError}
          </p>
        ) : null}
      </div>

      {/* The dialog collects the typed confirmation; the server re-checks it. */}
      <form ref={formRef} action={formAction} hidden>
        <input type="hidden" name="storyId" value={storyId} />
        <input type="hidden" name="id" value={chapterId} />
        <input type="hidden" name="confirmation" value={title} />
      </form>

      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => formRef.current?.requestSubmit()}
        title="Delete this chapter?"
        body={
          <div className="flex flex-col gap-2">
            <p>
              This permanently deletes <strong>{title}</strong> and renumbers the
              remaining chapters. This cannot be undone.
            </p>
            {confirmationError ? (
              <p role="alert" className="font-medium text-error">
                {confirmationError}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Delete chapter"
        confirmationPhrase={title}
        loading={pending}
      />
    </section>
  );
}
