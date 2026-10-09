import type { AlertTone } from "@/components/ui/Alert";

/**
 * Map a `notice` query parameter to a safe alert.
 *
 * The raw query value is never rendered. Only the keys in this table produce
 * output; an unknown value renders nothing, so a crafted `?notice=…` cannot
 * reflect text into the page.
 */
export interface ChapterNotice {
  tone: AlertTone;
  title: string;
  message?: string;
}

const NOTICES: Record<string, ChapterNotice> = {
  created: {
    tone: "success",
    title: "Chapter created",
    message: "It is saved as a draft until you publish it.",
  },
  saved: { tone: "success", title: "Changes saved" },
  deleted: { tone: "success", title: "Chapter deleted" },
  "deleted-empty": {
    tone: "warning",
    title: "Chapter deleted — this story has no published chapters",
    message:
      "The story stays in the catalogue, but readers cannot read it until another chapter is published.",
  },
  reordered: { tone: "success", title: "Chapter order saved" },
  published: { tone: "success", title: "Chapter published" },
  unpublished: {
    tone: "info",
    title: "Chapter unpublished",
    message: "It is now a draft and hidden from readers.",
  },
  archived: {
    tone: "warning",
    title: "Chapter archived",
    message: "It is hidden from readers.",
  },
};

export function resolveChapterNotice(raw: unknown): ChapterNotice | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  return NOTICES[value] ?? null;
}
