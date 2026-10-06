import type { Metadata } from "next";

export interface BuildTwitterArgs {
  title: string;
  description: string;
  image?: string;
}

export function buildTwitter({ title, description, image }: BuildTwitterArgs): Metadata["twitter"] {
  return {
    card: image ? "summary_large_image" : "summary",
    title,
    description,
    images: image ? [{ url: image, alt: title }] : undefined,
  };
}
