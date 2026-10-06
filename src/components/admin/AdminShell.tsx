import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The admin shell.
 *
 * Persistent left navigation from lg upward, a drawer below it. The chrome is
 * deliberately quieter than the reader surface so content is the focus, but
 * every control keeps the same token and focus treatment as the public site.
 *
 * This component renders the frame only. Route protection lives in the admin
 * layout guard, per AGENTS.md section 15.
 */
export function AdminShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-paper">
      <a
        href="#admin-main"
        className="sr-only-focusable focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-100 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:font-ui focus-visible:text-body-sm focus-visible:text-on-primary"
      >
        Skip to admin content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Below lg the sidebar becomes a native disclosure drawer. The same
            nav markup is rendered in both places; a sidebar hidden with
            `display:none` is not reachable by keyboard, so duplication is the
            accessible option here. `details` gives us the expanded state and
            keyboard behaviour without client JavaScript. */}
        <div className="lg:hidden">
          <details className="group border-b border-border bg-surface">
            <summary className="flex h-12 cursor-pointer list-none items-center gap-2.5 px-4 font-ui text-body-sm font-medium text-ink">
              <Menu aria-hidden="true" className="size-4" />
              Menu
              <ChevronDown
                aria-hidden="true"
                className="ml-auto size-4 text-ink-subtle transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="max-h-[80dvh] overflow-y-auto border-t border-border">
              {sidebar}
            </div>
          </details>
        </div>

        {header}
        <main id="admin-main" className="flex-1 shell-admin py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export interface AdminNavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  current?: boolean;
  /** Trailing count, e.g. draft stories. */
  count?: number;
}

/**
 * Presentational navigation list.
 *
 * Resolved `current` flags only: the caller decides what is active (the guarded
 * layout does it client-side from the pathname). Shared by `AdminSidebar` and
 * the live `AdminNav`, so the markup exists once.
 */
export function AdminNavList({
  sections,
}: {
  sections: Array<{ heading: string; items: AdminNavItem[] }>;
}) {
  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.heading} className="mb-6 last:mb-0">
          <h2 className="label-micro px-3 text-ink-subtle">{section.heading}</h2>
          <ul className="mt-2 flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-3 font-ui text-body-sm transition-colors",
                    item.current
                      ? "bg-surface-sunken font-medium text-ink"
                      : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  {item.icon ? (
                    <span aria-hidden="true" className="shrink-0 text-ink-subtle">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.count !== undefined ? (
                    <span className="shrink-0 font-ui text-body-xs tabular-nums text-ink-subtle">
                      {item.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({
  brand,
  sections,
  nav,
  footer,
}: {
  brand: ReactNode;
  /** Static sections. Ignored when `nav` is provided. */
  sections?: Array<{ heading: string; items: AdminNavItem[] }>;
  /** A fully rendered nav, e.g. the pathname-aware `AdminNav`. */
  nav?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
        {brand}
      </div>

      {nav ?? (sections ? <AdminNavList sections={sections} /> : null)}

      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </>
  );
}

/**
 * Admin page header.
 *
 * One primary action per region. The page title is the only h1 on the page.
 */
export function AdminPageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 border-b border-border pb-6",
        "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-display-md text-ink text-balance">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl font-ui text-body-sm text-ink-muted text-pretty">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-1">{meta}</div> : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Statistics card.
 *
 * A figure and a label. No gauges, no sparkline decoration: a dashboard is a
 * lookup surface, and a chart with no real trend behind it is invented data.
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon,
}: {
  label: string;
  value: number | string;
  /** Context for the figure. Never a fake percentage. */
  hint?: string;
  href?: string;
  icon?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="label-micro text-ink-subtle">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-ink-subtle/70">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-display-md text-ink tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 font-ui text-body-xs text-ink-muted">{hint}</p> : null}
    </>
  );

  const className =
    "flex flex-col rounded-md border border-border bg-surface p-5 text-left";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          className,
          "transition-[border-color,box-shadow] duration-(--duration-base) hover:border-border-strong hover:shadow-sm",
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

/**
 * Draft preview banner.
 *
 * Structurally distinct from the public route, per AGENTS.md section 6: a
 * different background, an explicit label, and a link back to the editor.
 */
export function DraftBanner({
  status,
  href,
}: {
  status: "DRAFT" | "ARCHIVED";
  href?: string;
}) {
  const isDraft = status === "DRAFT";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 font-ui text-body-xs",
        isDraft
          ? "border-b border-border-strong bg-surface-sunken text-ink-muted"
          : "border-b border-warning/30 bg-warning-surface text-warning",
      )}
    >
      <span className="font-medium">
        {isDraft
          ? "Draft preview — this story is not visible to readers"
          : "Archived preview — this story is not visible to readers"}
      </span>
      {href ? (
        <Link href={href} className="underline underline-offset-4 hover:text-ink">
          Back to editor
        </Link>
      ) : null}
    </div>
  );
}