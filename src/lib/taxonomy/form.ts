import type { AlertTone } from "@/components/ui/Alert";

/**
 * State returned to the taxonomy forms by their Server Actions.
 *
 * A `"use server"` module may only export async functions, so this shape lives
 * in a plain module. Success is conveyed by a server redirect and a `notice`
 * query parameter; this state carries only actionable failures. Mirrors
 * `src/lib/stories/form.ts`.
 */
export interface TaxonomyFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const INITIAL_TAXONOMY_FORM_STATE: TaxonomyFormState = { status: "idle" };

export interface TaxonomyNotice {
  tone: AlertTone;
  title: string;
  message?: string;
}

/**
 * Map a `notice` query parameter to a safe alert.
 *
 * The raw query value is never rendered. Only keys in these tables produce
 * output; an unknown value renders nothing, so a crafted `?notice=…` cannot
 * reflect text into the page.
 */
const CATEGORY_NOTICES: Record<string, TaxonomyNotice> = {
  created: {
    tone: "success",
    title: "Category created",
    message: "It appears on the public site once it holds a published story.",
  },
  saved: { tone: "success", title: "Category saved" },
  deleted: { tone: "success", title: "Category deleted" },
};

const TAG_NOTICES: Record<string, TaxonomyNotice> = {
  created: {
    tone: "success",
    title: "Tag created",
    message: "Assign it to stories from the story editor.",
  },
  saved: { tone: "success", title: "Tag saved" },
  deleted: { tone: "success", title: "Tag deleted" },
};

export function resolveCategoryNotice(raw: unknown): TaxonomyNotice | null {
  return lookup(CATEGORY_NOTICES, raw);
}

export function resolveTagNotice(raw: unknown): TaxonomyNotice | null {
  return lookup(TAG_NOTICES, raw);
}

function lookup(
  table: Record<string, TaxonomyNotice>,
  raw: unknown,
): TaxonomyNotice | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  return table[value] ?? null;
}
