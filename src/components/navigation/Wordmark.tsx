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
        "group inline-flex items-center gap-2 sm:gap-2.5 rounded-lg transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-[#FFE500] focus-visible:outline-offset-2 min-w-0",
        tone === "on-primary" && "inverted-focus",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-7 sm:size-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 bg-[#FFE500] text-black shadow-2xs transition-transform duration-300 ease-out group-hover:scale-105"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 sm:size-5"
        >
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      </span>
      <span
        className={cn(
          "font-sans text-lg sm:text-heading-xl font-black tracking-tight whitespace-nowrap",
          tone === "on-primary" ? "text-on-primary" : "text-ink",
        )}
      >
        Eagles Eye
      </span>
    </Link>
  );
}

