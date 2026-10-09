"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNavMenu } from "@/components/navigation/MobileNavMenu";
import { cn } from "@/lib/cn";

/**
 * Site header with responsive navigation.
 *
 * Designed with a clean, light, editorial-magazine aesthetic.
 * Background uses a warm paper tone with subtle backdrop blur and hairline border.
 * Navigation links use Archivo sans-serif typography with distinct active and hover states.
 *
 * Client-side only for `usePathname`: the current page must be marked with
 * `aria-current` in both nav renderings, and the server has no request path.
 * Everything else stays a plain render.
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

  const items = nav.map((item) => ({
    ...item,
    current:
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-paper/95 backdrop-blur-md shadow-2xs transition-colors">
      <div className="shell flex h-16 sm:h-20 items-center justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-3.5">
          <div className="shrink-0">{brand}</div>
          <span className="hidden md:inline-block h-4 w-px bg-border-strong/40" aria-hidden="true" />
          <span className="hidden md:inline-block font-ui text-[11px] font-semibold text-ink-subtle uppercase tracking-widest">
            Catalogue
          </span>
        </div>

        <nav aria-label={navLabel} className="hidden lg:block">
          <ul className="flex items-center gap-1.5 sm:gap-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-10 items-center rounded-md px-3.5 font-ui text-body-sm font-medium transition-all duration-(--duration-fast)",
                    item.current
                      ? "bg-primary-surface text-primary font-semibold shadow-2xs"
                      : "text-ink-muted hover:bg-surface-sunken/80 hover:text-ink",
                  )}
                >
                  {item.label}
                  {item.current ? (
                    <span
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {actions}

          <MobileNavMenu nav={items} navLabel={navLabel} />
        </div>
      </div>

      {children}
    </header>
  );
}

