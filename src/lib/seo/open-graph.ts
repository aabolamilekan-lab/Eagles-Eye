import type { Metadata } from "next";
import { absoluteUrl, siteName } from "./metadata";

export interface BuildOpenGraphArgs {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
  publishedTime?: string | Date;
  modifiedTime?: string | Date;
}

/**
 * Open Graph for a public route.
 *
 * Article tags (`publishedTime`, `modifiedTime`) only exist on the article
 * variant, so each type is built as its own literal and lets the return type
 * discriminate. Nothing here reads mutable input: every value comes from
 * published data resolved server-side.
 */
export function buildOpenGraph({
  title,
  description,
  path,
  type = "website",
  image,
  publishedTime,
  modifiedTime,
}: BuildOpenGraphArgs): Metadata["openGraph"] {
  const url = absoluteUrl(path);
  const images = image ? [{ url: absoluteUrl(image), alt: title }] : undefined;

  if (type === "article") {
    return {
      type: "article",
      title,
      description,
      url,
      siteName,
      locale: "en_US",
      images,
      publishedTime: publishedTime
        ? new Date(publishedTime).toISOString()
        : undefined,
      modifiedTime: modifiedTime
        ? new Date(modifiedTime).toISOString()
        : undefined,
    };
  }

  return {
    type: "website",
    title,
    description,
    url,
    siteName,
    locale: "en_US",
    images,
  };
}