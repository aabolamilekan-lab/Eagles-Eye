import Link from "next/link";
import { X } from "lucide-react";
import type { ActiveFilter } from "@/lib/filters/active-filters";

/**
 * The "Active:" row of removable filter chips shared by the catalogue and
 * search filter surfaces. Each chip is a link to the current view with that
 * one facet dropped, so removal works without JavaScript.
 */
export function ActiveFilterChips({ active }: { active: ActiveFilter[] }) {
  if (active.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="font-ui text-body-xs text-ink-muted">Active:</span>
      {active.map((filter) => (
        <Link
          key={filter.key}
          href={filter.href}
          aria-label={`Remove ${filter.label} filter`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 font-ui text-body-xs text-ink transition-colors duration-(--duration-fast) hover:bg-surface-sunken"
        >
          {filter.label}
          <X aria-hidden="true" className="size-3 text-ink-subtle" />
        </Link>
      ))}
    </div>
  );
}
