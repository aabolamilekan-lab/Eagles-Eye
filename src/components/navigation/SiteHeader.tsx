"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { MobileNavMenu } from "@/components/navigation/MobileNavMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";

const emptySubscribe = () => () => {};

function getTodaySnapshot(): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  } catch {
    return "Sunday, 11 October 2026";
  }
}

function getTodayServerSnapshot(): string {
  return "Sunday, 11 October 2026";
}

/**
 * Site header with responsive navigation.
 *
 * Implements the Suprast modern editorial news magazine aesthetic with a top
 * utility meta strip, clean brand badge, horizontal category links, and quick actions.
 */
export function SiteHeader({
  brand,
  nav,
  actions,
  children,
  navLabel = "Main",
}: {
  brand: ReactNode;
  nav: Array<{ label: string; href: string }>;
  actions?: ReactNode;
  /** Secondary row, e.g. a search field or category strip. */
  children?: ReactNode;
  /** Accessible name for both nav landmarks. Override when previewing. */
  navLabel?: string;
}) {
  const pathname = usePathname();
  const todayFormatted = useSyncExternalStore(
    emptySubscribe,
    getTodaySnapshot,
    getTodayServerSnapshot,
  );

  const items = nav.map((item) => ({
    ...item,
    current:
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));

  const defaultActions = (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link
        href="/search"
        aria-label="Search"
        className="flex size-8 sm:size-10 items-center justify-center rounded-full border border-border/80 bg-surface text-ink-muted transition-all hover:border-ink hover:text-ink hover:scale-105"
      >
        <Search className="size-3.5 sm:size-4" />
      </Link>
      <ThemeToggle />
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-paper/95 backdrop-blur-md shadow-2xs transition-colors">
      {/* Suprast Top Utility Meta Strip */}
      <div className="hidden sm:block border-b border-border/60 bg-surface/80 py-1.5 font-ui text-[12px] text-ink-subtle">
        <div className="shell flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="tabular-nums" suppressHydrationWarning>
              {todayFormatted}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="mailto:hello@eagleseye.com"
              className="hover:text-ink transition-colors font-medium"
            >
              hello@eagleseye.com
            </a>
          </div>
        </div>
      </div>

      {/* Masthead: Centered Logo like the newspaper header in screenshot */}
      <div className="shell flex h-16 sm:h-20 items-center justify-between gap-2.5 sm:gap-6">
        <div className="flex-1 hidden sm:flex items-center justify-start min-w-0">
          <span className="text-[11px] font-ui text-ink-subtle tracking-widest uppercase font-semibold">
            Independent Publishing
          </span>
        </div>
        <div className="flex-1 sm:hidden" />

        <div className="shrink-0 flex items-center justify-center">
          {brand}
        </div>

        <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-3 shrink-0">
          {actions ?? defaultActions}

          <MobileNavMenu nav={items} navLabel={navLabel} />
        </div>
      </div>

      {/* Centered Navigation Row: (stories, categories, search, about) */}
      <div className="hidden lg:block border-t border-border/80 bg-surface/50 dark:bg-surface-sunken/50">
        <div className="shell flex items-center justify-center py-2 sm:py-2.5">
          <nav aria-label={navLabel}>
            <ul className="flex items-center justify-center gap-1 sm:gap-2">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-9 items-center rounded-full px-4 sm:px-5 font-ui text-body-sm font-semibold tracking-wide transition-all duration-150",
                      item.current
                        ? "bg-ink text-surface shadow-xs"
                        : "text-ink-muted hover:bg-surface-sunken hover:text-ink dark:hover:bg-surface",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {children}
    </header>
  );
}

