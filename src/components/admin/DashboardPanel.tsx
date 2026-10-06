import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A bordered dashboard section.
 *
 * One heading level below the page `h1`, with an optional trailing action and
 * footer. Used for the panels that are not full-width tables.
 */
export function DashboardPanel({
  title,
  description,
  action,
  footer,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-md border border-border bg-surface",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-heading-sm text-ink">{title}</h2>
          {description ? (
            <p className="font-ui text-body-xs text-ink-muted text-pretty">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      <div className="min-w-0 flex-1">{children}</div>

      {footer ? (
        <div className="border-t border-border px-5 py-3">{footer}</div>
      ) : null}
    </section>
  );
}
