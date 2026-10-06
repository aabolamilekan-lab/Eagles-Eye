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
    <Link href={href} className="inline-flex items-baseline gap-1.5 rounded-md">
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
