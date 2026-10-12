import Image from "next/image";
import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPublishedDate } from "@/lib/format";

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
  /** Verified syndicated news source name when imported. */
  sourceName?: string | null;
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
  /** Optional numerical rank for editorial lists (e.g. 1 -> 01). */
  index,
  variant = "default",
  priority = false,
  className,
}: {
  story: StoryCardData;
  size?: "compact" | "full";
  layout?: "cover" | "row";
  index?: number;
  variant?: "default" | "yellow";
  priority?: boolean;
  className?: string;
}) {
  const href = `/stories/${story.slug}`;

  if (layout === "row") {
    const formattedIndex = index !== undefined ? String(index).padStart(2, "0") : null;
    const isYellow = variant === "yellow";

    return (
      <article
        className={cn(
          "group relative flex items-center gap-2.5 sm:gap-4 rounded-2xl p-2.5 sm:p-4 transition-all duration-200",
          isYellow
            ? "bg-[#FFE500] text-black shadow-xs hover:-translate-y-0.5"
            : "border border-border/80 bg-surface shadow-2xs hover:border-border-strong hover:shadow-md hover:-translate-y-0.5",
          "focus-within:ring-2 focus-within:ring-[#FFE500]/40",
          className,
        )}
      >
        {formattedIndex ? (
          <span
            className={cn(
              "font-display text-xl sm:text-3xl font-black shrink-0 w-5 sm:w-8 text-center select-none",
              isYellow ? "text-black/80" : "text-ink",
            )}
            aria-hidden="true"
          >
            {formattedIndex}
          </span>
        ) : null}

        <div className="relative size-16 sm:size-20 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
          {story.coverImageUrl ? (
            <Image
              src={story.coverImageUrl}
              alt={story.coverAlt ?? ""}
              fill
              sizes="80px"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <StoryCoverFallback title={story.title} />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1 justify-center flex-1">
          <div className="flex items-center gap-2">
            {story.category ? (
              <span
                className={cn(
                  "font-ui text-[11px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5",
                  isYellow
                    ? "bg-black/15 text-black"
                    : "bg-surface-sunken text-ink-subtle",
                )}
              >
                {story.category.name}
              </span>
            ) : null}
            {story.sourceName ? (
              <span
                className={cn(
                  "font-ui text-[11px] font-semibold truncate max-w-[120px]",
                  isYellow ? "text-black/80" : "text-ink-muted",
                )}
              >
                {story.sourceName}
              </span>
            ) : null}
            {story.readingMinutes ? (
              <span
                className={cn(
                  "font-ui text-[11px] font-medium",
                  isYellow ? "text-black/70" : "text-ink-subtle",
                )}
              >
                • {story.readingMinutes} min read
              </span>
            ) : null}
          </div>

          <h3
            className={cn(
              "font-sans text-body sm:text-heading-xs font-bold leading-snug tracking-tight text-balance line-clamp-2",
              isYellow ? "text-black" : "text-ink group-hover:text-black group-hover:underline transition-colors",
            )}
          >
            <Link
              href={href}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {story.title}
            </Link>
          </h3>

          <div className="flex items-center gap-2 font-ui text-[11px]">
            {story.author ? (
              <span className={cn("font-medium", isYellow ? "text-black/80" : "text-ink-muted")}>
                {story.author}
              </span>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface p-3.5 sm:p-4 shadow-2xs",
        "transition-all duration-(--duration-base) ease-(--ease-out-quart)",
        "hover:border-border-strong hover:shadow-md hover:-translate-y-1",
        "focus-within:border-[#FFE500] focus-within:ring-2 focus-within:ring-[#FFE500]/40",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-surface-sunken mb-3.5",
          size === "compact" ? "aspect-[16/10]" : "aspect-[16/10] sm:aspect-[3/2]",
        )}
      >
        {story.coverImageUrl ? (
          <Image
            src={story.coverImageUrl}
            alt={story.coverAlt ?? ""}
            fill
            sizes={
              size === "compact"
                ? "(max-width: 640px) 100vw, 320px"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
            priority={priority}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <StoryCoverFallback title={story.title} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {story.category ? (
            <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 font-ui text-[11px] font-bold text-ink-subtle uppercase tracking-wider">
              {story.category.name}
            </span>
          ) : null}
          {story.sourceName ? (
            <span className="font-ui text-[11px] font-semibold text-ink-muted">
              {story.sourceName}
            </span>
          ) : null}
          {story.readingMinutes ? (
            <span className="font-ui text-[11px] font-medium text-ink-subtle">
              • {story.readingMinutes} min read
            </span>
          ) : null}
        </div>

        <h3
          className={cn(
            "font-sans font-bold text-ink text-balance tracking-tight transition-colors group-hover:text-black group-hover:underline",
            size === "compact" ? "text-body" : "text-heading-sm sm:text-heading-md",
          )}
        >
          <Link
            href={href}
            prefetch={false}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {story.title}
          </Link>
        </h3>

        <p
          className={cn(
            "font-ui text-ink-muted text-pretty leading-relaxed",
            size === "compact" ? "line-clamp-2 text-body-xs" : "line-clamp-2 sm:line-clamp-3 text-body-sm",
          )}
        >
          {story.shortDescription}
        </p>

        <div className="mt-auto pt-3 border-t border-border/60">
          <StoryMeta story={story} />
        </div>
      </div>
    </article>
  );
}

function StoryMeta({ story }: { story: StoryCardData }) {
  const published = formatPublishedDate(story.publishedAt);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-body-xs text-ink-subtle">
      {story.author ? <span className="text-ink-muted font-medium">{story.author}</span> : null}
      {story.author && (published || story.readingMinutes) ? (
        <span aria-hidden="true" className="text-border-strong/70">·</span>
      ) : null}
      {published && story.publishedAt ? (
        <time dateTime={story.publishedAt}>{published}</time>
      ) : null}
      {published && story.readingMinutes ? (
        <span aria-hidden="true" className="text-border-strong/70">·</span>
      ) : null}
      {story.readingMinutes ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock aria-hidden="true" className="size-3 text-ink-subtle" />
          {story.readingMinutes} min read
        </span>
      ) : null}
    </div>
  );
}

export function StoryCoverFallback({ title }: { title: string }) {
  const letter = title.charAt(0).toUpperCase();
  const hash = Array.from(title).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Editorial palettes matching the modern Suprast dark and yellow aesthetic
  const palettes = [
    { bg: "bg-[#121417] text-white", border: "border-white/10" },
    { bg: "bg-[#FFE500] text-black", border: "border-black/10" },
    { bg: "bg-[#1e232a] text-white", border: "border-white/10" },
    { bg: "bg-surface-sunken text-ink", border: "border-border-strong" },
  ];
  
  const palette = palettes[hash % palettes.length] ?? palettes[0]!;

  return (
    <div className={cn("absolute inset-0 flex flex-col justify-between p-4 select-none overflow-hidden transition-transform duration-500 ease-out group-hover:scale-105", palette.bg)}>
      <div className="absolute -right-4 -bottom-4 font-display text-[7rem] font-bold leading-none opacity-10 pointer-events-none">
        {letter}
      </div>
      
      <div className="flex items-center justify-between border-b border-current/20 pb-2">
        <span className="font-ui text-[10px] font-semibold tracking-widest uppercase opacity-75">
          Eagles Eye
        </span>
        <span className="size-1.5 rounded-full bg-current opacity-60" />
      </div>

      <div className="my-auto py-2 text-center">
        <span className="font-display text-display-md font-semibold tracking-tight block">
          {letter}
        </span>
        <span className="mt-1 block font-display text-body-xs italic opacity-85 line-clamp-1">
          {title}
        </span>
      </div>

      <div className="border-t border-current/20 pt-2 flex justify-between items-center text-[10px] font-ui opacity-75">
        <span>PUBLIC CATALOGUE</span>
        <span className="h-0.5 w-4 bg-current opacity-60" />
      </div>
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
    <article className="group relative overflow-hidden rounded-3xl border border-border/70 bg-[#121417] shadow-sm transition-all duration-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-[#FFE500]">
      <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/10] w-full min-h-[320px] sm:min-h-[460px] overflow-hidden bg-surface-sunken">
        {story.coverImageUrl ? (
          <Image
            src={story.coverImageUrl}
            alt={story.coverAlt ?? ""}
            fill
            sizes="(max-width: 768px) 100vw, 65vw"
            priority={priority}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-103"
          />
        ) : (
          <StoryCoverFallback title={story.title} />
        )}

        {/* Dark gradient overlay for crystal clear contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent pointer-events-none" />

        {/* Content pinned to bottom */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-7 lg:p-9 flex flex-col gap-2.5 sm:gap-3 z-10">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {eyebrow ? (
              <span className="inline-flex items-center rounded-full bg-white/20 backdrop-blur-xs px-2.5 sm:px-3 py-0.5 sm:py-1 font-ui text-[11px] sm:text-[12px] font-medium text-white uppercase tracking-wider">
                {eyebrow}
              </span>
            ) : null}
            {story.category ? (
              <span className="inline-flex items-center rounded-full bg-[#FFE500] px-3 sm:px-3.5 py-0.5 sm:py-1 font-ui text-[11px] sm:text-[12px] font-bold text-black uppercase tracking-wider shadow-xs">
                {story.category.name}
              </span>
            ) : null}
            {story.sourceName ? (
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 sm:px-3 py-0.5 sm:py-1 font-ui text-[11px] sm:text-[12px] font-medium text-white/90">
                {story.sourceName}
              </span>
            ) : null}
            {story.readingMinutes ? (
              <span className="inline-flex items-center gap-1 font-ui text-[11px] sm:text-[12px] font-semibold text-white/90">
                <Clock className="size-3.5 text-[#FFE500]" />
                {story.readingMinutes} min read
              </span>
            ) : null}
          </div>

          <h3 className="font-sans text-xl sm:text-3xl lg:text-4xl font-black text-white text-balance tracking-tight leading-tight transition-colors group-hover:text-[#FFE500] break-words">
            <Link
              href={href}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {story.title}
            </Link>
          </h3>

          <p className="font-ui text-body-sm sm:text-body text-white/80 line-clamp-2 max-w-2xl leading-relaxed">
            {story.shortDescription}
          </p>

          <div className="flex items-center gap-2 pt-1 font-ui text-body-xs text-white/70">
            {story.author ? <span className="font-semibold text-white">{story.author}</span> : null}
            {story.author && story.publishedAt ? <span>•</span> : null}
            {story.publishedAt ? <span>{formatPublishedDate(story.publishedAt)}</span> : null}
          </div>
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
