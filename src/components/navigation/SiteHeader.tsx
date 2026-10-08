"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNavMenu } from "@/components/navigation/MobileNavMenu";
import { cn } from "@/lib/cn";

/**
 * Site header with responsive navigation.
 *
 * On mobile the menu is a native <details> disclosure, so its expanded state
 * and keyboard behaviour come from the platform rather than from script. On lg
 * and up the same destinations render as an inline nav. Links are real
 * anchors either way.
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
    <header className="sticky top-0 z-40 border-b border-primary-hover/80 bg-primary/95 backdrop-blur-sm shadow-xs">
      <div className="shell flex h-16 items-center gap-6">
        <div className="shrink-0">{brand}</div>

        <nav aria-label={navLabel} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    "inverted-focus inline-flex h-10 items-center rounded-md px-3.5 font-ui text-body-sm font-medium transition-all duration-(--duration-fast)",
                    item.current
                      ? "bg-primary-hover text-on-primary shadow-xs"
                      : "text-on-primary/90 hover:bg-primary-hover/75 hover:text-on-primary",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {actions}

          <MobileNavMenu nav={items} navLabel={navLabel} />
        </div>
      </div>

      {children}
    </header>
  );
}
