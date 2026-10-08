"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * keeps working if hydration is delayed. Script adds the behaviours a
 * `<details>` does not give for free:
 *
 *   - `aria-expanded` / `aria-controls` on the summary, and a label that
 *     flips between "Open menu" and "Close menu"
 *   - Escape closes it and returns focus to the summary
 *   - choosing a destination, or navigating to any route, closes it
 *   - clicking outside closes it
 *   - Tab is trapped between the summary and the panel links while open
 *   - background scroll is locked while open
 *
 * Escape is handled at the document level rather than only on the panel, so it
 * works after focus moves into the menu itself.
 */
const PANEL_ID = "mobile-nav-panel";

export function MobileNavMenu({
  nav,
  navLabel,
}: {
  nav: MobileNavItem[];
  navLabel: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Keep the React state (and therefore aria-expanded) in step with the
  // platform attribute, however it was toggled.
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onToggle = () => setOpen(details.open);
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, []);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details?.open) return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    function close(returnFocus: boolean) {
      if (!details || !details.open) return;
      details.open = false;
      if (returnFocus) summaryRef.current?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!details?.open) return;

      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }

      if (event.key !== "Tab") return;

      // Trap: cycle between the summary and the panel's links only.
      const focusables = [
        ...(summaryRef.current ? [summaryRef.current] : []),
        ...details.querySelectorAll<HTMLElement>("nav a"),
      ];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!details.contains(active)) {
        event.preventDefault();
        first.focus();
      }
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

  // A route change dismisses the panel even when navigation did not come from
  // one of its own links.
  useEffect(() => {
    const details = detailsRef.current;
    if (details?.open) details.open = false;
  }, [pathname]);

  return (
    <details ref={detailsRef} className="group relative lg:hidden">
      <summary
        ref={summaryRef}
        id="mobile-nav-trigger"
        aria-controls={PANEL_ID}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inverted-focus inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-md text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Menu aria-hidden="true" className="size-5" />
      </summary>
      <nav
        id={PANEL_ID}
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
