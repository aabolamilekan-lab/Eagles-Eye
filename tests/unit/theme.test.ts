import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  THEME_STORAGE_KEY,
  applyThemeClass,
  getStoredTheme,
  setTheme,
  toggleTheme,
} from "@/lib/theme/useTheme";

describe("Theme Management", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const classListSet = new Set<string>();
    const attributes: Record<string, string> = {};

    globalThis.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      length: 0,
    };

    globalThis.window = {
      matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      documentElement: {
        classList: {
          add: (cls: string) => classListSet.add(cls),
          remove: (cls: string) => classListSet.delete(cls),
          contains: (cls: string) => classListSet.has(cls),
        },
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
        getAttribute: (name: string) => attributes[name] ?? null,
        removeAttribute: (name: string) => {
          delete attributes[name];
        },
      },
    } as unknown as Document;
  });

  describe("applyThemeClass", () => {
    it("adds .dark and sets data-theme to dark", () => {
      applyThemeClass("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("removes .dark and sets data-theme to light", () => {
      document.documentElement.classList.add("dark");
      applyThemeClass("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("getStoredTheme and setTheme", () => {
    it("reads stored preference from localStorage", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      expect(getStoredTheme()).toBe("dark");

      localStorage.setItem(THEME_STORAGE_KEY, "light");
      expect(getStoredTheme()).toBe("light");
    });

    it("setTheme updates localStorage and DOM class", () => {
      setTheme("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      setTheme("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("toggleTheme switches between dark and light", () => {
      setTheme("light");
      toggleTheme();
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      toggleTheme();
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("ThemeToggle component", () => {
    it("renders an accessible icon toggle button with ARIA attributes", () => {
      const html = renderToStaticMarkup(React.createElement(ThemeToggle));
      expect(html).toContain('aria-label="Switch to dark mood"');
      expect(html).toContain("<button");
      expect(html).toContain('type="button"');
    });

    it("renders a row variant for mobile drawer with label text", () => {
      const html = renderToStaticMarkup(
        React.createElement(ThemeToggle, { variant: "row" }),
      );
      expect(html).toContain('aria-label="Switch to dark mood"');
      expect(html).toContain("Light mood");
    });
  });
});
