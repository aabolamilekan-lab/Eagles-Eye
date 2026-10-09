import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The Wordmark.
 *
 * Rendered using Newsreader serif display typography with tight tracking
 * and an editorial brand dot accent.
 */
export function Wordmark({
  href = "/",
  tone = "ink",
  className,
}: {
  href?: string;
  /** `on-primary` for placement on dark surfaces like the oxblood footer. */
  tone?: "ink" | "on-primary" | "primary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2 rounded-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        tone === "on-primary" && "inverted-focus",
        className,
      )}
    >
      <span
        className={cn(
          "font-display text-heading-lg sm:text-display-sm font-bold tracking-tight text-balance",
          tone === "on-primary"
            ? "text-on-primary"
            : tone === "primary"
              ? "text-primary"
              : "text-ink",
        )}
      >
        Eagles&nbsp;<span className={tone === "on-primary" ? "text-on-primary" : "text-primary"}>Eye</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full transition-transform duration-300 ease-out group-hover:scale-125",
          tone === "on-primary" ? "bg-on-primary shadow-xs" : "bg-primary",
        )}
      />
    </Link>
  );
}

