import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Empty state.
 *
 * Three things, always: what would be here, why it is not, and the action that
 * changes that. Never a bare "No data".
 *
 * `tone="reader"` is calm and explanatory. `tone="admin"` carries a primary
 * action, because the operator is the one who fixes it.
 */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  tone = "reader",
  className,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
  tone?: "reader" | "admin";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-md border border-dashed border-border-strong/60 bg-surface text-center",
        // Generous vertical space: an empty region should feel like a room,
        // not a rendering failure.
        tone === "admin" ? "px-6 py-16" : "px-6 py-14",
        className,
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-ink-subtle/70">
          {icon}
        </div>
      ) : null}

      <div className="flex max-w-md flex-col gap-2">
        <h2 className="font-display text-heading-md text-ink text-balance">
          {title}
        </h2>
        <p className="font-ui text-body-sm text-ink-muted text-pretty">
          {description}
        </p>
      </div>

      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      ) : null}

      {children}
    </div>
  );
}

/**
 * Error state.
 *
 * The message is safe by construction: it is a prop chosen by the caller, not
 * an error string. Never render a caught error's `message` here.
 *
 * `headingLevel` defaults to `h2` for inline use under an existing page `h1`.
 * Route-segment error boundaries render it as the only content on the page and
 * must pass `"h1"` so the page still has a top-level heading.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this content. Please try again in a moment.",
  action,
  headingLevel = "h2",
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  headingLevel?: "h1" | "h2";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-4 rounded-md border border-error/25 bg-error-surface px-6 py-14 text-center",
        className,
      )}
    >
      <ErrorGlyph />
      <div className="flex max-w-md flex-col gap-2">
        <Heading className="font-display text-heading-md text-ink">
          {title}
        </Heading>
        <p className="font-ui text-body-sm text-ink-muted text-pretty">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Not-found. A distinct state from an error: nothing is broken. */
export function NotFoundState({
  title = "Page not found",
  description = "The page you were looking for does not exist, or has moved.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-24 text-center">
      <p className="font-display text-display-xl text-border-strong">404</p>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display text-display-sm text-ink">{title}</h1>
        <p className="font-ui text-body-sm text-ink-muted text-pretty">
          {description}
        </p>
      </div>
      {action ?? (
        <Link
          href="/"
          className="font-ui text-body-sm text-accent underline underline-offset-4 hover:text-ink"
        >
          Return to the home page
        </Link>
      )}
    </div>
  );
}

function ErrorGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-8 text-error"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  );
}