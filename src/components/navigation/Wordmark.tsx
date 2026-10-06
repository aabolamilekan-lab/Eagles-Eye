import Link from "next/link";

/** The wordmark. Serif, tight tracking: the one place the display face is tiny. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-1.5 rounded-md">
      <span className="font-display text-heading-lg font-semibold tracking-[-0.02em] text-ink">
        Eagles&nbsp;Eye
      </span>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
    </Link>
  );
}
