import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

/**
 * Admin form layout.
 *
 * One column. Label, control, help, error. Grouped fields use fieldset and
 * legend so the relationship survives without a visual box.
 *
 * This is layout only. Submission, validation and error mapping belong to
 * Server Actions, per AGENTS.md section 9.
 */
export function AdminForm({
  children,
  action,
  footer,
  className,
}: {
  children: ReactNode;
  /**
   * A Server Action or a route path. Never a client event handler — this
   * component is rendered on the server, per AGENTS.md section 9.
   */
  action?: string | ((formData: FormData) => void | Promise<void>);
  /** Submit and cancel controls, rendered in a sticky footer bar. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <form action={action} className={cn("flex flex-col", className)}>
      <div className="flex max-w-2xl flex-col gap-6">{children}</div>
      {footer}
    </form>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "flex flex-col gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <legend className="font-display text-heading-sm text-ink">{title}</legend>
      {description ? (
        <p className="-mt-2 max-w-xl font-ui text-body-sm text-ink-muted text-pretty">
          {description}
        </p>
      ) : null}
      {children}
    </fieldset>
  );
}

/**
 * Sticky action bar for long admin forms.
 *
 * Submit on the right, cancel to its left, destructive actions separated to
 * the far left so they cannot be hit by accident.
 */
export function FormActions({
  submitLabel = "Save",
  cancel,
  saving = false,
  destructive,
  disabled = false,
}: {
  submitLabel?: string;
  /** Cancel control, rendered by the caller (usually a link or client button). */
  cancel?: ReactNode;
  saving?: boolean;
  /** Rendered on the far left, visually separated from the primary action. */
  destructive?: ReactNode;
  /** Disabled only when saving, never as a substitute for showing errors. */
  disabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-border bg-paper py-4">
      {destructive ? <div className="flex-1">{destructive}</div> : <span className="flex-1" />}

      {cancel}

      <Button
        type="submit"
        variant="primary"
        loading={saving}
        loadingLabel={`${submitLabel}, please wait`}
        disabled={disabled}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

/**
 * Editor chrome for the Tiptap surface.
 *
 * The toolbar is a group of real buttons with accessible names. The editor
 * itself is client-only; the server remains the sanitization authority, per
 * AGENTS.md section 10. This component does not sanitize anything.
 */
export function EditorFrame({
  toolbar,
  children,
  footer,
  className,
}: {
  toolbar: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border-strong bg-surface",
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-controls="editor-surface"
        className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-sunken px-2 py-1.5"
      >
        {toolbar}
      </div>

      {/*
        id="editor-surface" ties the toolbar to the editable region.
        The editor mounts here; it is not rendered on the server.
      */}
      <div id="editor-surface" className="prose min-h-64 px-5 py-4">
        {children}
      </div>

      {footer ? (
        <div className="border-t border-border bg-surface-sunken px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One toolbar control.
 *
 * Toggle controls pass `active` and get `aria-pressed`; one-shot controls omit
 * it and do not. Active state is shown by background, not colour alone. Extra
 * button attributes (a `tabIndex`, a `data-*` hook, an `onFocus`) pass through
 * so a roving-tabindex toolbar can drive focus without a duplicated component.
 */
export interface ToolbarButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "aria-pressed" | "type" | "onClick" | "children"
  > {
  label: string;
  active?: boolean;
  onClick?: () => void;
  /** Stable hook used by the roving-tabindex toolbar. */
  "data-tool"?: string;
  children: ReactNode;
}

export function ToolbarButton({
  label,
  active,
  onClick,
  children,
  className,
  ...rest
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-sm font-ui text-body-xs",
        "transition-colors hover:bg-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        active ? "bg-border text-ink" : "text-ink-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}