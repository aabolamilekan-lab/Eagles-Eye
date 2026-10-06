"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MobileNavItem {
  label: string;
  href: string;
  current?: boolean;
}

/**
 * Mobile navigation disclosure.
 *
 * The expanded state still comes from the platform: this is a native
 * `<details>`, so it opens on click and on Enter/Space without script, and it
 * keeps working if hydration is delayed. Script only adds the three behaviours
 * a `<details>` does not give for free:
 *
 *   - Escape closes it and returns focus to the summary, so a keyboard user is
 *     never stranded with the panel open
 *   - choosing a destination closes it
 *   - clicking outside closes it
 *
 * Escape is handled at the document level rather than only on the panel, so it
 * works after focus moves into the menu itself.
 */
export function MobileNavMenu({
  nav,
  navLabel,
}: {
  nav: MobileNavItem[];
  navLabel: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    function close(returnFocus: boolean) {
      if (!details || !details.open) return;
      details.open = false;
      if (returnFocus) summaryRef.current?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      close(true);
    }

    function onPointerDown(event: PointerEvent) {
      if (!details?.open) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (details.contains(target)) return;
      close(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <details ref={detailsRef} className="group relative lg:hidden">
      <summary
        ref={summaryRef}
        aria-label="Open menu"
        className="inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-md text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Menu aria-hidden="true" className="size-5" />
      </summary>
      <nav
        aria-label={navLabel}
        className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-border bg-surface p-1.5 shadow-lg"
        onClick={(event) => {
          // A chosen destination dismisses the panel.
          if ((event.target as HTMLElement).closest("a")) {
            if (detailsRef.current) detailsRef.current.open = false;
          }
        }}
      >
        <ul className="flex flex-col">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-md px-3 font-ui text-body-sm transition-colors",
                  item.current
                    ? "bg-surface-sunken font-medium text-ink"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}