"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme/useTheme";
import { cn } from "@/lib/cn";

interface ThemeToggleProps {
  className?: string;
  variant?: "icon" | "row";
}

/**
 * Accessible 2-way theme (light/dark mood) toggle button.
 *
 * Implements smooth SVG icon transitions and explicit ARIA labels.
 */
export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, isDark, toggleTheme } = useTheme();

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 font-ui text-body-sm font-semibold transition-colors",
          "text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-[#FFE500]",
          className,
        )}
        aria-label={isDark ? "Switch to light mood" : "Switch to dark mood"}
      >
        <span className="flex items-center gap-2.5">
          {isDark ? (
            <Moon className="size-4 text-ink-muted shrink-0" aria-hidden="true" />
          ) : (
            <Sun className="size-4 text-ink-muted shrink-0" aria-hidden="true" />
          )}
          <span>{isDark ? "Dark mood" : "Light mood"}</span>
        </span>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-ui text-[11px] font-bold text-ink-muted uppercase tracking-wider">
          {theme}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative flex size-8 sm:size-10 items-center justify-center rounded-full border border-border/80 bg-surface text-ink-muted transition-all",
        "hover:border-ink hover:text-ink hover:scale-105",
        "focus-visible:outline-2 focus-visible:outline-[#FFE500] focus-visible:outline-offset-2",
        className,
      )}
      aria-label={isDark ? "Switch to light mood" : "Switch to dark mood"}
      title={isDark ? "Switch to light mood" : "Switch to dark mood"}
    >
      <Sun
        className={cn(
          "size-3.5 sm:size-4 transition-all duration-200",
          isDark ? "scale-0 rotate-90 opacity-0 absolute" : "scale-100 rotate-0 opacity-100",
        )}
        aria-hidden="true"
      />
      <Moon
        className={cn(
          "size-3.5 sm:size-4 transition-all duration-200",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0 absolute",
        )}
        aria-hidden="true"
      />
      <span className="sr-only">
        {isDark ? "Switch to light mood" : "Switch to dark mood"}
      </span>
    </button>
  );
}
