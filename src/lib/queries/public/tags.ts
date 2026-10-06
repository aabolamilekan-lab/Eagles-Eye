import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { PUBLIC_STORY_WHERE } from "@/lib/queries/public/story-filter";

/**
 * Published tag reads.
 *
 * A tag is offered publicly only while it is attached to at least one published
 * story, so an admin's draft tagging never surfaces on the reader side.
 */

export const PUBLIC_TAGS_TAG = "public:tags";

export interface TagOption {
  name: string;
  slug: string;
}

/** Option cap for the catalogue filter; far above any real tag count. */
const MAX_TAG_OPTIONS = 50;
const REVALIDATE_SECONDS = 300;

async function queryTagOptions(): Promise<TagOption[]> {
  return prisma.tag.findMany({
    where: { storyTags: { some: { story: PUBLIC_STORY_WHERE } } },
    select: { name: true, slug: true },
    orderBy: { name: "asc" },
    take: MAX_TAG_OPTIONS,
  });
}

export const getPublishedTagOptions = unstable_cache(
  async () => queryTagOptions(),
  ["public:tag-options"],
  { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_TAGS_TAG] },
);
