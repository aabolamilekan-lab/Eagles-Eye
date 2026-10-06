"use client";

import { useActionState, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteCategoryAction } from "@/actions/category";
import { INITIAL_TAXONOMY_FORM_STATE } from "@/lib/taxonomy/form";

/**
 * Destructive category action, kept apart from the form.
 *
 * A category that still holds stories cannot be deleted: the relation is
 * `Restrict`, so the region explains what to do instead of offering a button
 * that would fail. When it is empty, deletion is behind a typed confirmation
 * the Server Action re-checks (AGENTS.md sections 14 and 15).
 */
export function CategoryDangerZone({
  categoryId,
  name,
  storyCount,
}: {
  categoryId: string;
  name: string;
  storyCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteCategoryAction,
    INITIAL_TAXONOMY_FORM_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const confirmationError = state.fieldErrors?.confirmation?.[0];
  const generalError =
    state.status === "error" && !confirmationError ? state.message : undefined;

  const blocked = storyCount > 0;

  return (
    <section className="mt-12 rounded-md border border-error/30 bg-error-surface/40 p-5">
      <h2 className="font-display text-heading-sm text-ink">Danger zone</h2>
      <p className="mt-2 max-w-2xl font-ui text-body-sm text-ink-muted text-pretty">
        {blocked
          ? `This category is assigned to ${storyCount} ${
              storyCount === 1 ? "story" : "stories"
            }. Move or delete ${
              storyCount === 1 ? "it" : "them"
            } before deleting the category.`
          : "Deleting permanently removes this category. This cannot be undone."}
      </p>

      {blocked ? null : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              size="sm"
              leadingIcon={<Trash2 className="size-4" />}
              onClick={() => setOpen(true)}
            >
              Delete category
            </Button>
            {generalError ? (
              <p
                role="alert"
                className="font-ui text-body-xs font-medium text-error"
              >
                {generalError}
              </p>
            ) : null}
          </div>

          {/* The dialog collects the typed confirmation; the server re-checks it. */}
          <form ref={formRef} action={formAction} hidden>
            <input type="hidden" name="id" value={categoryId} />
            <input type="hidden" name="confirmation" value={name} />
          </form>

          <ConfirmDialog
            open={open}
            onCancel={() => setOpen(false)}
            onConfirm={() => formRef.current?.requestSubmit()}
            title="Delete this category?"
            body={
              <div className="flex flex-col gap-2">
                <p>
                  This permanently deletes <strong>{name}</strong>. This cannot
                  be undone.
                </p>
                {confirmationError ? (
                  <p role="alert" className="font-medium text-error">
                    {confirmationError}
                  </p>
                ) : null}
              </div>
            }
            confirmLabel="Delete category"
            confirmationPhrase={name}
            loading={pending}
          />
        </>
      )}
    </section>
  );
}
