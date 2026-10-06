import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "error";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /**
   * Adds a leading dot. Required for any badge that encodes status, so the
   * meaning survives greyscale. Never colour alone.
   */
  dot?: boolean;
  icon?: ReactNode;
}

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-ink-muted ring-border",
  primary: "bg-primary-surface text-primary ring-primary/20",
  accent: "bg-accent-surface text-accent ring-accent/20",
  success: "bg-success-surface text-success ring-success/20",
  warning: "bg-warning-surface text-warning ring-warning/20",
  error: "bg-error-surface text-error ring-error/20",
};

const DOT: Record<BadgeTone, string> = {
  neutral: "bg-ink-subtle",
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

export function Badge({
  tone = "neutral",
  dot = false,
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "font-ui text-body-xs font-medium whitespace-nowrap",
        "ring-1 ring-inset",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])}
        />
      ) : null}
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * Content status as a badge.
 *
 * DRAFT, PUBLISHED, ARCHIVED. The label is always rendered, so status is
 * never conveyed by colour alone. Mirrors the Prisma enum; see AGENTS.md
 * section 5.
 */
export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const STATUS: Record<ContentStatus, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  PUBLISHED: { tone: "success", label: "Published" },
  ARCHIVED: { tone: "warning", label: "Archived" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ContentStatus;
  className?: string;
}) {
  const { tone, label } = STATUS[status];

  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}