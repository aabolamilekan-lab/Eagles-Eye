import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Card anatomy. One component set, composed by every story and admin surface.
 *
 * Cards carry a hairline border rather than a shadow. Shadow is reserved for
 * things genuinely floating above the page, which keeps the page calm.
 */

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `raised` lifts the card off the page with a border and shadow. */
  variant?: "flat" | "raised";
  /** Adds hover affordance. Use only when the card is a link target. */
  interactive?: boolean;
  as?: "div" | "article" | "section" | "li";
}

export function Card({
  variant = "flat",
  interactive = false,
  as: Tag = "div",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(
        "relative rounded-md bg-surface",
        variant === "raised"
          ? "border border-border shadow-sm"
          : "border border-transparent",
        interactive &&
          "transition-[border-color,box-shadow] duration-(--duration-base) ease-(--ease-out-quart) hover:border-border-strong hover:shadow-md",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-heading-sm text-ink", className)}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("font-ui text-body-sm text-ink-muted", className)} {...rest}>
      {children}
    </p>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5 pt-0", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border px-5 py-3",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Stretched link.
 *
 * The title is the only link. This pseudo-element expands its hit area across
 * the card without nesting interactive elements, so each card still exposes
 * exactly one accessible name.
 */
export function StretchedLink({
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        "after:absolute after:inset-0 after:content-['']",
        "focus-visible:outline-offset-4",
        className,
      )}
      {...rest}
    />
  );
}

/** A small hairline section divider with optional trailing action. */
export function SectionHeading({
  title,
  eyebrow,
  action,
  id,
  className,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  /** Applied to the heading so a wrapping section can reference it via aria-labelledby. */
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex items-end justify-between gap-6 border-b border-border pb-3",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        {eyebrow ? (
          <p className="label-micro text-ink-subtle">{eyebrow}</p>
        ) : null}
        <h2 id={id} className="font-display text-display-sm text-ink">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}