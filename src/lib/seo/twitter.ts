import type { Metadata } from "next";
import { absoluteUrl } from "./canonical";
import { ogImageUrl } from "./cover-url";
import { DEFAULT_OG_IMAGE } from "./open-graph";

/**
 * Twitter card for a public route.
 *
 * The card is `summary_large_image` only when a real cover exists — a
 * `summary` card is what an un-cropped image should wear — but the image
 * itself is never omitted: a route without a cover carries the default card
 * image, so the card is never empty. No `site` or `creator` handle is emitted
 * because none is verified; an invented handle is worse than an absent one.
 */

export interface BuildTwitterArgs {
  title: string;
  description?: string;
  /** Cover path; `null`/omitted falls back to the default card image. */
  image?: string | null;
  imageAlt?: string;
}

export function buildTwitter({
  title,
  description,
  image,
  imageAlt,
}: BuildTwitterArgs): NonNullable<Metadata["twitter"]> {
  const images = [
    {
      url: absoluteUrl(ogImageUrl(image ?? DEFAULT_OG_IMAGE)),
      alt: imageAlt ?? title,
    },
  ];

  return {
    card: image ? "summary_large_image" : "summary",
    title,
    ...(description === undefined ? {} : { description }),
    images,
  };
}
