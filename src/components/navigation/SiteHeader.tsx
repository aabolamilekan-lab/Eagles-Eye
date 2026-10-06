import type { ReactNode } from "react";
import Link from "next/link";
import { MobileNavMenu } from "@/components/navigation/MobileNavMenu";
import { cn } from "@/lib/cn";

/**
 * Site header with responsive navigation.
 *
 * On mobile the menu is a native <details> disclosure, so its expanded state
 * and keyboard behaviour come from the platform rather than from script. On lg
 * and up the same destinations render as an inline nav. Links are real
 * anchors either way.
 */
export function SiteHeader({
  brand,
  nav,
  actions,
  children,
  navLabel = "Main",
}: {
  brand: ReactNode;
  nav: Array<{ label: string; href: string; current?: boolean }>;
  actions?: ReactNode;
  /** Secondary row, e.g. a search field or category strip. */
  children?: ReactNode;
  /** Accessible name for both nav landmarks. Override when previewing. */
  navLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-primary-hover bg-primary">
      <div className="shell flex h-16 items-center gap-6">
        <div className="shrink-0">{brand}</div>

        <nav aria-label={navLabel} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-md px-3 font-ui text-body-sm transition-colors",
                    item.current
                      ? "bg-primary-hover font-medium text-on-primary"
                      : "text-on-primary hover:bg-primary-hover",
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

          <MobileNavMenu nav={nav} navLabel={navLabel} />
        </div>
      </div>

      {children}
    </header>
  );
}
