import type { AlertTone } from "@/components/ui/Alert";

/**
 * Map a `notice` query parameter to a safe alert.
 *
 * The raw query value is never rendered. Only the keys in this table produce
 * output; an unknown value renders nothing, so a crafted `?notice=…` cannot
 * reflect text into the page.
 */
export interface StoryNotice {
  tone: AlertTone;
  title: string;
  message?: string;
}

const NOTICES: Record<string, StoryNotice> = {
  created: {
    tone: "success",
    title: "Story created",
    message: "It is saved as a draft until you publish it.",
  },
  saved: { tone: "success", title: "Changes saved" },
  deleted: { tone: "success", title: "Story deleted" },
  published: { tone: "success", title: "Story published" },
  "publish-warning": {
    tone: "warning",
    title: "Story published without a published chapter",
    message:
      "It is already visible in the catalogue. Publish a chapter so readers can start reading it.",
  },
  unpublished: {
    tone: "info",
    title: "Story unpublished",
    message: "It is now a draft and hidden from readers.",
  },
  archived: {
    tone: "warning",
    title: "Story archived",
    message: "Its published chapters were archived in the same change.",
  },
  restored: {
    tone: "info",
    title: "Story restored to draft",
    message: "Archived chapters stay archived until you republish them.",
  },
  featured: { tone: "success", title: "Story featured" },
  unfeatured: { tone: "info", title: "Story unfeatured" },
  "cover-removed": { tone: "info", title: "Cover removed" },
};

export function resolveStoryNotice(raw: unknown): StoryNotice | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  return NOTICES[value] ?? null;
}
