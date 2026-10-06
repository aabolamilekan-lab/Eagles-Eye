"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Widens the panel for forms and tables. */
  size?: "sm" | "md" | "lg";
  /**
   * Blocks Escape and backdrop dismissal. For destructive confirmation while a
   * mutation is in flight, so the outcome is never ambiguous.
   */
  dismissible?: boolean;
}

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

/**
 * One dialog for the whole application.
 *
 * Accessibility contract, all handled here so no call site can skip it:
 *   - rendered as a native <dialog> with showModal(), so the browser traps
 *     focus, makes the background inert, and handles stacking
 *   - labelled by its own heading via aria-labelledby
 *   - focus moves in on open and returns to the trigger on close
 *   - Escape closes when dismissible
 *   - background scroll is locked
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Closing is a request, not a local action: the parent owns `open`, so the
  // native dialog and React state can never disagree.
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
    }
  }, []);

  // Restore focus on unmount too, so a dialog torn down by navigation does not
  // strand focus on a detached node.
  useEffect(() => {
    return restoreFocus;
  }, [restoreFocus]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (open) {
      if (!node.open) {
        triggerRef.current = document.activeElement as HTMLElement | null;
        node.showModal();
      }
      // Focus the first control, not the close button, so the panel opens on
      // its primary action.
      const focusable = node.querySelector<HTMLElement>(
        "[data-autofocus], button:not([disabled]), input:not([disabled]), textarea, select, a[href]",
      );
      focusable?.focus();
    } else if (node.open) {
      node.close();
      restoreFocus();
    }
  }, [open, restoreFocus]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onCancel = (event: Event) => {
      // Prevent the native Escape close when not dismissible.
      if (!dismissible) {
        event.preventDefault();
        return;
      }
      onClose();
    };

    node.addEventListener("cancel", onCancel);
    return () => node.removeEventListener("cancel", onCancel);
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (dismissible && event.target === ref.current) handleClose();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] p-0 text-ink",
        "rounded-lg border border-border bg-paper shadow-lg backdrop:bg-ink/40",
        // Full-height sheet on mobile, centred panel from sm upward.
        "h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[85dvh]",
        SIZE[size],
        "open:flex open:flex-col",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2
            id={titleId}
            className="font-display text-heading-md text-ink text-balance"
          >
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="font-ui text-body-sm text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={!dismissible}
          aria-label="Close dialog"
          className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <X aria-hidden="true" className="size-4.5" />
        </button>
      </div>

      {children ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      ) : null}

      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
