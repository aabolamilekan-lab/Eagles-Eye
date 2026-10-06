import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "w-full rounded-sm border border-border-strong bg-surface px-3 text-ink " +
  "placeholder:text-ink-subtle/70 transition-colors duration-(--duration-fast) " +
  "hover:border-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-sunken " +
  "disabled:text-ink-subtle";

const CONTROL_ERROR =
  "border-error focus-visible:outline-error hover:border-error";

/** Shared shell: label above, control, help text, then error. */
function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="font-ui text-body-sm font-medium text-ink">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-error">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : (
          <span className="ml-1.5 font-normal text-ink-subtle">optional</span>
        )}
      </label>

      {children}

      {hint ? (
        <p id={`${id}-hint`} className="font-ui text-body-xs text-ink-muted">
          {hint}
        </p>
      ) : null}

      {/* role="alert" so a late-arriving server error is announced. */}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="font-ui text-body-xs font-medium text-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null];
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  /** Server-returned message for this field. Never a raw thrown error. */
  error?: string | undefined;
  /**
   * Optional control pinned inside the right edge of the input (for example a
   * password visibility toggle). The input reserves space for it, so the value
   * is never covered. Keyboard order follows the input, as a trailing control
   * should.
   */
  trailing?: ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  trailing,
  ...rest
}: TextFieldProps) {
  const generated = useId();
  const id = `field-${generated}`;

  const input = (
    <input
      id={id}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      className={cn(
        CONTROL_BASE,
        "h-11 font-ui text-body-sm",
        trailing ? "pr-16" : undefined,
        error && CONTROL_ERROR,
        className,
      )}
      {...rest}
    />
  );

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      {trailing ? (
        <span className="relative block">
          {input}
          <span className="absolute inset-y-0 right-1 flex items-center">
            {trailing}
          </span>
        </span>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: string;
  error?: string | undefined;
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  rows = 4,
  ...rest
}: TextAreaFieldProps) {
  const generated = useId();
  const id = `field-${generated}`;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(
          CONTROL_BASE,
          "py-2.5 font-ui text-body-sm leading-(--leading-body) resize-y",
          error && CONTROL_ERROR,
          className,
        )}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: string;
  error?: string | undefined;
  /** First option acts as the prompt. Hidden from the accessible name count. */
  placeholder?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  placeholder,
  options,
  className,
  ...rest
}: SelectFieldProps) {
  const generated = useId();
  const id = `field-${generated}`;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            CONTROL_BASE,
            "h-11 appearance-none pr-10 font-ui text-body-sm",
            error && CONTROL_ERROR,
            className,
          )}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Chevron />
      </div>
    </FieldShell>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/** A checkbox with its label as the hit target, not a 16px square. */
export interface CheckboxFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  hint?: string;
}

export function CheckboxField({
  label,
  hint,
  className,
  ...rest
}: CheckboxFieldProps) {
  const generated = useId();
  const id = `check-${generated}`;

  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "mt-0.5 size-4.5 shrink-0 cursor-pointer appearance-none rounded-xs border border-border-strong bg-surface",
          "checked:border-primary checked:bg-primary",
          // The tick is a mask so it inherits the control's colour.
          "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m3.5 8.5 3 3 6-7%22/></svg>')] checked:bg-contain checked:bg-center checked:bg-no-repeat",
          "transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="font-ui text-body-sm text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="font-ui text-body-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}