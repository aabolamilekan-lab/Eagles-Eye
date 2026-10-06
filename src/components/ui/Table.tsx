import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Data table.
 *
 * A real <table>, because a grid of divs breaks the row/column relationship
 * that screen readers rely on to announce "row 3, column 2, Status".
 *
 * The caller supplies the header row and body rows so each table can choose
 * its own columns; this component owns only the semantics, the alignment
 * rules, and the surrounding states.
 */
export function Table({
  caption,
  children,
  className,
}: {
  /** Required. Describes the table for screen readers; visually hidden. */
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-sunken">
      <tr className="border-b border-border">{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-(--color-border)">{children}</tbody>;
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-surface-sunken/60">{children}</tr>;
}

export function TableHeaderCell({
  children,
  scope = "col",
  align = "left",
  sort,
}: {
  children: ReactNode;
  scope?: "col" | "row";
  align?: "left" | "right";
  /**
   * Current sort state. Omit entirely for columns the query cannot sort, so
   * no false affordance is shown.
   */
  sort?: "ascending" | "descending" | "none";
}) {
  return (
    <th
      scope={scope}
      aria-sort={sort}
      className={cn(
        "label-micro px-4 py-3 font-semibold text-ink-subtle",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  align = "left",
  /** Use on the identifying cell so row navigation has a name. */
  header = false,
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  header?: boolean;
  className?: string;
}) {
  const Cell = header ? "th" : "td";

  return (
    <Cell
      scope={header ? "row" : undefined}
      className={cn(
        "px-4 py-3.5 align-middle font-ui text-body-sm text-ink",
        align === "right" && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </Cell>
  );
}

/** Sort control inside a header cell. A real button, with aria-sort on the th. */
export function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "ascending" | "descending";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-ui transition-colors",
        active ? "text-ink" : "text-ink-subtle hover:text-ink",
      )}
    >
      {label}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className={cn("size-3", active ? "opacity-100" : "opacity-40")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2.5 8.5 5.5h-5L6 2.5ZM6 9.5 3.5 6.5h5L6 9.5Z" />
      </svg>
      {/* Announced in addition to aria-sort on the th. */}
      <span className="sr-only">
        {active
          ? `, sorted ${direction === "ascending" ? "ascending" : "descending"}`
          : ", not sorted"}
      </span>
    </button>
  );
}

/** Row count. Placed outside the scroll container so it never scrolls away. */
export function TableMeta({ children }: { children: ReactNode }) {
  return (
    <p className="font-ui text-body-xs text-ink-muted tabular-nums">{children}</p>
  );
}