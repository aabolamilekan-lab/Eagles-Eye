import { unstable_cache } from "next/cache";
import { querySitemap } from "@/lib/queries/public/sitemap";
import { PUBLIC_CATEGORIES_TAG } from "@/lib/queries/public/categories";
import { PUBLIC_STORIES_TAG } from "@/lib/queries/public/stories";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const revalidate = 300;

/**
 * Sitemap.
 *
 * The catalogue is enumerated in bounded pages and capped at the protocol's
 * 50,000-URL ceiling, so one request never has to materialize the whole story or
 * chapter set (see `src/lib/queries/public/sitemap.ts`).
 *
 * Tagged with both public tags, so an admin publish, unpublish, delete or
 * category change drops it immediately rather than waiting out the revalidation
 * window (AGENTS.md section 6).
 */
const getSitemap = unstable_cache(async () => querySitemap(baseUrl), [
  "public:sitemap",
], {
  revalidate,
  tags: [PUBLIC_STORIES_TAG, PUBLIC_CATEGORIES_TAG],
});

export default async function sitemap() {
  return getSitemap();
}
