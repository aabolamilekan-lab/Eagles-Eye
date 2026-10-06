"use client";

import type { ReactNode } from "react";
import type { KeyboardEvent } from "react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

/**
 * Tabs following the WAI-ARIA tabs pattern with manual activation.
 *
 * Arrow keys move focus between tabs; Enter or Space activates. Manual rather
 * than automatic activation, because panel content here can be expensive and
 * should not load merely by being focused.
 */
export function Tabs({
  items,
  defaultTab,
  label,
  className,
}: {
  items: TabItem[];
  defaultTab?: string;
  /** Names the tab set for screen readers. */
  label: string;
  className?: string;
}) {
  const baseId = useId();
  const active = defaultTab ?? items[0]?.id ?? "";

  return (
    <TabsInner
      items={items}
      active={active}
      baseId={baseId}
      label={label}
      className={className}
    />
  );
}

function TabsInner({
  items,
  active: initialActive,
  baseId,
  label,
  className,
}: {
  items: TabItem[];
  active: string;
  baseId: string;
  label: string;
  className?: string;
}) {
  // Controlled internally: tabs are a view concern, not server state.
  const [active, setActive] = useState(initialActive);

  const panelIdFor = (id: string) => `${baseId}-panel-${id}`;
  const tabIdFor = (id: string) => `${baseId}-tab-${id}`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled);
    const currentIndex = enabled.findIndex((item) => item.id === active);
    if (currentIndex === -1) return;

    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % enabled.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabled.length - 1;
    }

    if (nextIndex === undefined) return;
    event.preventDefault();

    const next = enabled[nextIndex];
    if (!next) return;
    setActive(next.id);
    document.getElementById(tabIdFor(next.id))?.focus();
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              id={tabIdFor(item.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelIdFor(item.id)}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3.5 py-2.5 font-ui text-body-sm font-medium",
                "transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "border-primary text-ink"
                  : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          id={panelIdFor(item.id)}
          role="tabpanel"
          aria-labelledby={tabIdFor(item.id)}
          hidden={item.id !== active}
          tabIndex={0}
          className="pt-5 focus-visible:outline-offset-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}