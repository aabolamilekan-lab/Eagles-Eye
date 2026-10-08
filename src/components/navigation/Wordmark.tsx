import Link from "next/link";
import { cn } from "@/lib/cn";

/** The wordmark. Serif, tight tracking: the one place the display face is tiny. */
export function Wordmark({
  href = "/",
  tone = "ink",
}: {
  href?: string;
  /** `on-primary` for placement on the primary-coloured header and footer bands. */
  tone?: "ink" | "on-primary";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2 rounded-md transition-opacity hover:opacity-95",
        tone === "on-primary" && "inverted-focus",
      )}
    >
      <span
        className={cn(
          "font-display text-heading-lg font-bold tracking-[-0.025em]",
          tone === "on-primary" ? "text-on-primary" : "text-ink",
        )}
      >
        Eagles&nbsp;Eye
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
