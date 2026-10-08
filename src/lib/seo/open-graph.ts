import type { Metadata } from "next";
import { absoluteUrl } from "./canonical";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, ogImageUrl } from "./cover-url";

/**
 * Open Graph for a public route.
 *
 * Article tags (`publishedTime`, `modifiedTime`) only exist on the article
 * variant, so each type is built as its own literal and lets the return type
 * discriminate. Nothing here reads mutable input: every value comes from
 * published data resolved server-side.
 *
 * An image is never omitted. A route without a cover falls back to
 * `public/og-default.png`, so no card ever renders blank or broken. All URLs
 * resolve through the canonical builder, and the dimensions describe the
 * 1200×630 rendition the image route actually serves.
 */

/** Static fallback card image, 1200×630, served from `public/`. */
export const DEFAULT_OG_IMAGE = "/og-default.png";

export interface BuildOpenGraphArgs {
  title: string;
  description?: string;
  path: string;
  type?: "website" | "article";
  /** Cover path; `null`/omitted falls back to {@link DEFAULT_OG_IMAGE}. */
  image?: string | null;
  imageAlt?: string;
  publishedTime?: string | Date;
  modifiedTime?: string | Date;
}

export function buildOpenGraph({
  title,
  description,
  path,
  type = "website",
  image,
  imageAlt,
  publishedTime,
  modifiedTime,
}: BuildOpenGraphArgs): NonNullable<Metadata["openGraph"]> {
  const url = absoluteUrl(path);
  const images = [
    {
      url: absoluteUrl(ogImageUrl(image ?? DEFAULT_OG_IMAGE)),
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: imageAlt ?? title,
    },
  ];
  const descriptionField =
    description === undefined ? {} : { description };

  if (type === "article") {
    return {
      type: "article",
      title,
      ...descriptionField,
      url,
      locale: "en_US",
      images,
      ...(publishedTime
        ? { publishedTime: new Date(publishedTime).toISOString() }
        : {}),
      ...(modifiedTime
        ? { modifiedTime: new Date(modifiedTime).toISOString() }
        : {}),
    };
  }

  return {
    type: "website",
    title,
    ...descriptionField,
    url,
    locale: "en_US",
    images,
  };
}
