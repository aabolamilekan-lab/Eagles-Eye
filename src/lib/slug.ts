/**
 * Server-side slug generation for stories.
 *
 * Slugs are always derived on the server, never trusted from the client, and
 * are ASCII, lowercase and hyphen-separated so they are stable in a URL.
 * AGENTS.md section 16; .agent/skills/story-management/SKILL.md.
 */
const MAX_SLUG_LENGTH = 80;
const FALLBACK_SLUG = "story";
const MAX_SUFFIX = 1000;

/**
 * Normalize a title into a URL slug.
 *
 * Diacritics are stripped via `NFKD`, every run of non `[a-z0-9]` becomes a
 * single `-`, and leading/trailing hyphens are trimmed. Long results are cut on
 * a hyphen boundary at or before the cap. A title with no usable characters
 * falls back to `fallback` rather than producing an empty slug.
 */
export function slugifyTitle(
  input: string,
  fallback: string = FALLBACK_SLUG,
): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  let slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  if (slug.length > MAX_SLUG_LENGTH) {
    const clipped = slug.slice(0, MAX_SLUG_LENGTH);
    const lastHyphen = clipped.lastIndexOf("-");
    slug = (lastHyphen > 0 ? clipped.slice(0, lastHyphen) : clipped).replace(
      /-+$/g,
      "",
    );
  }

  return slug.length > 0 ? slug : fallback;
}

/**
 * Resolve a slug that is not already taken.
 *
 * The base slug is returned when free; otherwise a `-2`, `-3`, … suffix is
 * appended and re-checked. `isTaken` is injected so the caller controls the
 * lookup and this function stays free of the Prisma client and unit-testable.
 * A pathological run of collisions falls back to a time-based suffix so the
 * function always terminates with a value.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(base))) {
    return base;
  }

  for (let suffix = 2; suffix < MAX_SUFFIX; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Resolve a chapter slug that is unique within its story.
 *
 * Chapter slugs are scoped per story, so two different stories may each have a
 * `chapter-1`. The base is derived from the title and falls back to `chapter`
 * (not `story`), and `isTaken` is expected to check within the same story.
 * Delegates to `uniqueSlug`, so the suffix logic exists once.
 */
export async function uniqueChapterSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  return uniqueSlug(slugifyTitle(title, "chapter"), isTaken);
}
