import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_STORIES_TAG } from "@/lib/queries/public/stories";
import { PUBLIC_CATEGORIES_TAG } from "@/lib/queries/public/categories";
import { PUBLIC_TAGS_TAG } from "@/lib/queries/public/tags";

/**
 * Invalidate every public cache affected by a story mutation.
 *
 * Runs after a successful mutation, outside the transaction, so a rolled-back
 * write never clears a cache. The story tag covers the featured/recent/popular
 * rails, the catalogue, the detail page and the chapter reader; category and
 * tag pages depend on a story's publish state too. AGENTS.md section 6.
 *
 * Uses `updateTag` (Next 16) rather than `revalidateTag`: it expires the tag
 * immediately for read-your-own-writes, which is exactly a Server Action's
 * post-mutation requirement, and it matches the tag profile used by the
 * `unstable_cache` reads in `src/lib/queries/public/`.
 */
export function revalidatePublicStoryCaches(): void {
  updateTag(PUBLIC_STORIES_TAG);
  updateTag(PUBLIC_CATEGORIES_TAG);
  updateTag(PUBLIC_TAGS_TAG);
  revalidatePath("/");
  revalidatePath("/stories");
}
