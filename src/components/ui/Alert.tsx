import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "error";

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  /** Action affordance, e.g. "Try again". */
  action?: ReactNode;
  className?: string;
}

const TONE = {
  info: {
    wrap: "border-accent/25 bg-accent-surface text-accent",
    icon: Info,
  },
  success: {
    wrap: "border-success/25 bg-success-surface text-success",
    icon: CheckCircle2,
  },
  warning: {
    wrap: "border-warning/25 bg-warning-surface text-warning",
    icon: AlertTriangle,
  },
  error: {
    wrap: "border-error/25 bg-error-surface text-error",
    icon: XCircle,
  },
} as const;

/**
 * Inline alert.
 *
 * The tone is carried by an icon and a text label as well as colour, so it
 * survives greyscale. `error` alerts announce themselves via role="alert".
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: AlertProps) {
  const Icon = TONE[tone].icon;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3",
        TONE[tone].wrap,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-ui text-body-sm font-semibold">{title}</p>
        {children ? (
          <div className="font-ui text-body-sm opacity-90">{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}