"use client";

import { useEffect } from "react";

/**
 * Site-wide keyboard shortcut.
 *
 * `/` focuses the search field — the convention every search UI already
 * teaches. Ignored while the reader is typing anywhere (inputs, textareas,
 * selects, contenteditable) or while a dialog owns focus, so it can never
 * inject a character into content.
 *
 * The target is found by landmark role rather than by a shared id, so the
 * shortcut keeps working wherever the search form renders. Renders nothing.
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const tag = active.tagName;
        if (
          active.isContentEditable ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "SUMMARY"
        ) {
          return;
        }
      }

      // A dialog has taken over the page; the shortcut must not steal focus.
      if (document.querySelector("dialog[open]")) return;

      const input = document.querySelector<HTMLInputElement>(
        'form[role="search"] input[type="search"]',
      );
      if (!input) return;

      event.preventDefault();
      input.focus();
      input.select();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
