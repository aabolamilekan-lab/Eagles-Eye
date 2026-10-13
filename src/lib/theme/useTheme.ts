"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "eagles-eye-theme";

let currentTheme: Theme = "light";
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Storage access may fail in restricted contexts (e.g. sandboxed iframes)
  }
  return getSystemTheme();
}

export function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
  }
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  currentTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage access may fail
  }
  applyThemeClass(theme);
  notify();
}

export function toggleTheme() {
  const next = currentTheme === "dark" ? "light" : "dark";
  setTheme(next);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return "light";
}

// Initialize theme state on client boot
if (typeof window !== "undefined") {
  currentTheme = getStoredTheme();
  applyThemeClass(currentTheme);

  // Sync with OS preference when user has not explicitly stored an override
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    try {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        setTheme(e.matches ? "dark" : "light");
      }
    } catch {
      setTheme(e.matches ? "dark" : "light");
    }
  });

  // Cross-tab synchronization
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
      currentTheme = e.newValue;
      applyThemeClass(currentTheme);
      notify();
    }
  });
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme,
  };
}
