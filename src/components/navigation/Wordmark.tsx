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
        "inline-flex items-baseline gap-1.5 rounded-md",
        tone === "on-primary" && "inverted-focus",
      )}
    >
      <span
        className={cn(
          "font-display text-heading-lg font-semibold tracking-[-0.02em]",
          tone === "on-primary" ? "text-on-primary" : "text-ink",
        )}
      >
        Eagles&nbsp;Eye
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "on-primary" ? "bg-on-primary" : "bg-primary",
        )}
      />
    </Link>
  );
}
