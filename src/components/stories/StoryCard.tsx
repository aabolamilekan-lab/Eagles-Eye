import Image from "next/image";
import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPublishedDate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";

/**
 * The data a story card renders.
 *
 * Deliberately narrow and derived from the Story model in AGENTS.md section 5.
 * Author and publication date come from the database; nothing here is invented.
 * All values are server-derived and serializable across the RSC boundary.
 */
export interface StoryCardData {
  slug: string;
  title: string;
  /** Story author, or null when the story has none recorded. */
  author: string | null;
  /** Plain-text short description; the card clamps it. */
  shortDescription: string;
  coverImageUrl: string | null;
  coverAlt: string | null;
  category: { name: string; slug: string } | null;
  /** Null when the story has no published chapters yet. */
  chapterCount: number | null;
  /** Estimated reading time in minutes, or null when unknown. */
  readingMinutes: number | null;
  /** ISO 8601 publication date, or null when the story is not published. */
  publishedAt: string | null;
}

/**
 * Story card.
 *
 * One component, used on the home page, listings, category pages, search
 * results and related stories. The title is the only link; a stretched
 * pseudo-element extends the hit area without nesting interactive elements, so
 * each card still exposes exactly one accessible name.
 */
export function StoryCard({
  story,
  /** `compact` for sidebars and related lists, `full` for grids. */
  size = "full",
  /** `cover` stacks image above text, `row` puts a small cover beside it. */
  layout = "cover",
  priority = false,
  className,
}: {
  story: StoryCardData;
  size?: "compact" | "full";
  layout?: "cover" | "row";
  priority?: boolean;
  className?: string;
}) {
  const href = `/stories/${story.slug}`;

  if (layout === "row") {
    return (
      <article
        className={cn(
          "group relative flex gap-4",
          className,
        )}
      >
        <div className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-surface-sunken sm:size-24">
          {story.coverImageUrl ? (
            <Image
              src={story.coverImageUrl}
              alt={story.coverAlt ?? ""}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <StoryCoverFallback title={story.title} />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          {story.category ? (
            <Badge tone="primary">{story.category.name}</Badge>
          ) : null}
          <h3 className="font-display text-heading-sm text-ink text-balance">
            <Link
              href={href}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-[''] group-hover:underline"
            >
              {story.title}
            </Link>
          </h3>
          <p className="line-clamp-2 font-ui text-body-sm text-ink-muted text-pretty">
            {story.shortDescription}
          </p>
          <StoryMeta story={story} />
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-border bg-surface",
        "transition-[border-color,box-shadow] duration-(--duration-base) ease-(--ease-out-quart)",
        "hover:border-border-strong hover:shadow-md",
        "focus-within:border-border-strong",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-surface-sunken",
          size === "compact" ? "aspect-[16/10]" : "aspect-[3/2]",
        )}
      >
        {story.coverImageUrl ? (
          <Image
            src={story.coverImageUrl}
            alt={story.coverAlt ?? ""}
            fill
            // Explicit sizes keep the browser from downloading a desktop image
            // for a 375px card. The aspect-ratio container is what guarantees
            // no layout shift; `fill` forbids width/height props outright.
            sizes={
              size === "compact"
                ? "(max-width: 640px) 100vw, 320px"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
            priority={priority}
            className="object-cover"
          />
        ) : (
          // A missing cover is designed, not broken. Editorial rule and the
          // first letter of the title: a masthead placeholder.
            <StoryCoverFallback title={story.title} />
        )}
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col gap-2.5",
          size === "compact" ? "p-4" : "p-5",
        )}
      >
        {story.category ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{story.category.name}</Badge>
          </div>
        ) : null}

        <h3
          className={cn(
            "font-display text-ink text-balance",
            size === "compact" ? "text-heading-xs" : "text-heading-md",
          )}
        >
          <Link
            href={href}
            prefetch={false}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {story.title}
          </Link>
        </h3>

        <p
          className={cn(
            "font-ui text-ink-muted text-pretty",
            size === "compact" ? "line-clamp-2 text-body-xs" : "line-clamp-3 text-body-sm",
          )}
        >
          {story.shortDescription}
        </p>

        <div className="mt-auto pt-1">
          <StoryMeta story={story} />
        </div>
      </div>
    </article>
  );
}

function StoryMeta({ story }: { story: StoryCardData }) {
  const hasChapterCount = story.chapterCount !== null;
  const published = formatPublishedDate(story.publishedAt);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-body-xs text-ink-subtle">
      {story.author ? <span className="text-ink-muted">{story.author}</span> : null}
      {published && story.publishedAt ? (
        <time dateTime={story.publishedAt}>{published}</time>
      ) : null}
      {hasChapterCount ? (
        <span className="tabular-nums">
          {story.chapterCount === 1 ? "1 chapter" : `${story.chapterCount} chapters`}
        </span>
      ) : null}
      {story.readingMinutes ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock aria-hidden="true" className="size-3" />
          {story.readingMinutes} min read
        </span>
      ) : null}
    </div>
  );
}

export function StoryCoverFallback({ title }: { title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-surface-sunken">
      <span
        aria-hidden="true"
        className="font-display text-display-md text-border-strong select-none"
      >
        {title.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

/**
 * Featured story.
 *
 * Asymmetric by design: the eye should land here first, so it occupies a wide
 * slot with a larger cover than the grid it sits beside. Not a bigger card with
 * a gradient.
 */
export function FeaturedStory({
  story,
  eyebrow,
  priority = false,
}: {
  story: StoryCardData;
  eyebrow?: string;
  priority?: boolean;
}) {
  const href = `/stories/${story.slug}`;

  return (
    <article className="group relative overflow-hidden rounded-md border border-border bg-surface">
      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken md:aspect-auto md:min-h-80">
          {story.coverImageUrl ? (
            <Image
              src={story.coverImageUrl}
              alt={story.coverAlt ?? ""}
              fill
              sizes="(max-width: 768px) 100vw, 55vw"
              priority={priority}
              className="object-cover"
            />
          ) : (
          <StoryCoverFallback title={story.title} />
          )}
        </div>

        <div className="flex flex-col justify-center gap-4 p-6 sm:p-8 lg:p-10">
          {eyebrow ? (
            <p className="label-micro text-primary">{eyebrow}</p>
          ) : null}

          <h3 className="font-display text-display-md text-ink text-balance">
            <Link
              href={href}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {story.title}
            </Link>
          </h3>

          <p className="font-ui text-body text-ink-muted text-pretty">
            {story.shortDescription}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            {story.category ? (
              <Badge tone="primary">{story.category.name}</Badge>
            ) : null}
            <StoryMeta story={story} />
          </div>

          <span className="mt-1 inline-flex items-center gap-1.5 font-ui text-body-sm font-medium text-accent">
            Begin reading
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" />
            </svg>
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Story grid.
 *
 * One column on mobile, two from sm, three from lg. Editorial listings are
 * usually uniform; the asymmetry lives in FeaturedStory, not here.
 */
export function StoryGrid({
  stories,
  priorityCount = 1,
  className,
}: {
  stories: StoryCardData[];
  /**
   * First N covers get priority loading. Default 1, because `priority`
   * preloads, and preloading several covers competes with the single LCP
   * candidate for bandwidth instead of helping it.
   */
  priorityCount?: number;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid list-none grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {stories.map((story, index) => (
        <li key={story.slug} className="flex">
          <StoryCard
            story={story}
            priority={index < priorityCount}
            className="w-full"
          />
        </li>
      ))}
    </ul>
  );
}
