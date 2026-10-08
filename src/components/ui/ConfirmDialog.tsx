"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  /** Names the record and states exactly what will happen. */
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Locks dismissal and the button while the mutation runs. */
  loading?: boolean;
  /**
   * Requires the user to type this exact string before confirming is enabled.
   * Use for irreversible, wide-blast-radius actions.
   */
  confirmationPhrase?: string;
}

/**
 * Destructive confirmation.
 *
 * Never `window.confirm`. Names the record, states the consequences, and can
 * require a typed phrase. The server re-checks regardless; this is a safety
 * net for the operator, not the control.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  loading = false,
  confirmationPhrase,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    if (open) {
      if (!node.open) {
        node.showModal();
        // The typed phrase is the point of the dialog, so it gets focus.
        if (confirmationPhrase) inputRef.current?.focus();
      }
    } else if (node.open) {
      node.close();
    }
  }, [open, confirmationPhrase]);

  // Clear the phrase on dismissal rather than in an effect: a cascading
  // render to reset an input is not worth the extra pass.
  const dismiss = () => {
    setTyped("");
    onCancel();
  };

  const phraseMatched =
    !confirmationPhrase || typed.trim() === confirmationPhrase;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        dismiss();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-md p-0 text-ink",
        "rounded-lg border border-border bg-paper shadow-lg backdrop:bg-ink/40",
        "open:flex open:flex-col",
      )}
    >
      <div className="flex flex-col gap-2 px-5 pt-5">
        <h2 id={titleId} className="font-display text-heading-md text-ink">
          {title}
        </h2>
        <div id={bodyId} className="font-ui text-body-sm text-ink-muted">
          {body}
        </div>
      </div>

      {confirmationPhrase ? (
        <div className="flex flex-col gap-1.5 px-5 pt-4">
          <label
            htmlFor={`${titleId}-confirm`}
            className="font-ui text-body-sm font-medium text-ink"
          >
            Type <span className="font-mono text-body-xs">{confirmationPhrase}</span> to
            confirm
          </label>
          <input
            ref={inputRef}
            id={`${titleId}-confirm`}
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-body-sm text-ink placeholder:text-ink-subtle"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-5">
        <button
          type="button"
          onClick={dismiss}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface px-5 font-ui text-body-sm font-medium text-ink transition-colors hover:bg-surface-sunken disabled:pointer-events-none disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => void onConfirm()}
          disabled={loading || !phraseMatched}
          aria-busy={loading || undefined}
          className="inline-flex h-11 items-center justify-center rounded-md border border-error bg-error px-5 font-ui text-body-sm font-medium text-white transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? "Working" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}