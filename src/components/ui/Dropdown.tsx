"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, EllipsisVertical } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DropdownItem {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  /** Renders in error colour. The label still carries the meaning. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  /** Accessible name for the trigger. Required. */
  label: string;
  items: DropdownItem[];
  /** Renders the trigger as a labelled button instead of an icon-only control. */
  variant?: "icon" | "button";
  align?: "start" | "end";
}

/**
 * Action menu.
 *
 * The trigger is a real button exposing `aria-haspopup` / `aria-expanded` and a
 * controlled menu. The menu is dismissed on outside pointerdown and on Escape,
 * with focus returned to the trigger. Items are real links or buttons, so
 * keyboard and middle-click both work.
 */
export function Dropdown({
  label,
  items,
  variant = "icon",
  align = "end",
}: DropdownProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={variant === "icon" ? label : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-ui font-medium",
          "transition-colors duration-(--duration-fast) hover:bg-surface-sunken",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          variant === "icon"
            ? "size-11 text-ink-muted hover:text-ink"
            : "h-11 gap-1.5 border border-border-strong bg-surface px-3 text-body-xs text-ink",
        )}
      >
        {variant === "button" ? (
          <>
            {label}
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </>
        ) : (
          <EllipsisVertical aria-hidden="true" className="size-4" />
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-50 mt-1.5 min-w-52 rounded-md border border-border bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => (
            <MenuItem
              key={`${item.label}-${index}`}
              item={item}
              onDismiss={() => setOpen(false)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  item,
  onDismiss,
}: {
  item: DropdownItem;
  onDismiss: () => void;
}) {
  const shared = cn(
    "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left font-ui text-body-sm",
    "transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken",
    "disabled:pointer-events-none disabled:opacity-50",
    item.destructive ? "text-error" : "text-ink",
  );

  const content = (
    <>
      {item.icon ? (
        <span aria-hidden="true" className="shrink-0">
          {item.icon}
        </span>
      ) : null}
      {item.label}
    </>
  );

  if (item.href) {
    return (
      <a
        href={item.disabled ? undefined : item.href}
        role="menuitem"
        className={shared}
        aria-disabled={item.disabled || undefined}
        onClick={(event) => {
          if (item.disabled) {
            event.preventDefault();
            return;
          }
          onDismiss();
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      className={shared}
      onClick={() => {
        item.onSelect?.();
        onDismiss();
      }}
    >
      {content}
    </button>
  );
}

/** Standalone disclosure used where a full menu is not warranted. */
export function Disclosure({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-ui text-body-sm text-ink-muted transition-colors hover:text-ink">
        {summary}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}
