import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. Keeps the label for screen readers. */
  loading?: boolean;
  /** Text announced while loading. Defaults to "Working". */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/*
 * Variants differ by background, border, weight and text colour together, so
 * the distinction survives greyscale and colour-vision deficiency. A primary
 * button is never distinguished by hue alone.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary border border-primary hover:bg-primary-hover hover:border-primary-hover active:bg-primary-active",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-sunken",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-surface-sunken",
  subtle: "bg-surface-sunken text-ink border border-transparent hover:bg-border",
  danger:
    "bg-error text-white border border-error hover:bg-error/90 active:bg-error",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-xs gap-1.5",
  md: "h-11 px-5 text-body-sm gap-2",
  lg: "h-12 px-7 text-body gap-2.5",
  // 44px target, satisfied by padding rather than a larger glyph.
  icon: "h-11 w-11 p-0 gap-0",
};

/**
 * The shared button surface.
 *
 * Exported so a navigation link can look like a button without duplicating the
 * variant classes, and so the `<Link>` and `<button>` versions cannot drift.
 */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md font-ui font-medium",
    "transition-colors duration-(--duration-fast) ease-(--ease-out-quart)",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel = "Working",
  leadingIcon,
  trailingIcon,
  type = "button",
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      // Always explicit. Defaulting to submit inside a form is a real bug source.
      type={type}
      disabled={isDisabled}
      // aria-disabled keeps the control announced while aria-busy explains why.
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : (
        <>
          {leadingIcon ? (
            <span aria-hidden="true" className="shrink-0">
              {leadingIcon}
            </span>
          ) : null}
          {children}
          {trailingIcon ? (
            <span aria-hidden="true" className="shrink-0">
              {trailingIcon}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/**
 * A link styled as a button.
 *
 * Navigation must stay an anchor: a `<button>` that calls `router.push` loses
 * middle-click, new-tab, and correct semantics. Use this for actions that
 * navigate; use `Button` for actions that mutate.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {leadingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {leadingIcon}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </Link>
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 shrink-0 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}