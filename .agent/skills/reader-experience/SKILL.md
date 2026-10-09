# Skill: Reader Experience

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md section 6 sets the public-visibility contract, section 16 sets clean URLs and pagination.
This skill covers the reading surface itself: home composition, listing and grid, story detail
structure, the long-form chapter reader, previous/next/by-index chapter navigation, the
no-published-chapters-yet state, and reader-side pagination, covers, performance, and accessibility.
Visual rules are owned by `.agent/skills/ui-ux/SKILL.md`; this skill owns data shape, the
visibility enforcement points, and reading ergonomics. Nothing here restates AGENTS.md.

## When to use

- Creating or changing a page under `src/app/(public)/`, including `/` and `/stories/**`.
- Changing a query in `src/lib/queries/public/` that a reader route consumes.
- Building or changing `StoryCard`, `StoryGrid`, `ChapterNav`, `ReadingProgress`, `Pagination`, or the sanitized chapter renderer.
- Changing pagination defaults, page sizes, cache tags, or revalidation on public reads.
- Reviewing a reader surface for accessibility, mobile behaviour, or long-form readability.
- Changing how covers are requested, sized, or alt-texted publicly.

Not for `/admin/**`, storage internals, or authentication.

## Relevant files

| Path | Role on the reader surface |
| --- | --- |
| `src/app/(public)/page.tsx` | Home: featured rail, recently published, category entries |
| `src/app/(public)/stories/page.tsx` | Full listing, filters and page in query parameters |
| `src/app/(public)/stories/[slug]/page.tsx` | Story detail: cover, metadata, published chapter list |
| `src/app/(public)/stories/[slug]/chapter/[chapterSlug]/page.tsx` | Chapter reader: title, body, chapter nav |
| `src/app/(public)/layout.tsx` | Public shell: header, skip link, landmarks, footer |
| `src/components/public/story-card.tsx` | The one card implementation, used on every reader surface |
| `src/components/public/chapter-nav.tsx` | Previous / next / by-index navigation |
| `src/components/public/reading-progress.tsx` | The one client component on a chapter page |
| `src/components/public/pagination.tsx` | Shared pager driven by page and total count |
| `src/components/public/rich-text.tsx` | The single sanctioned sanitized-HTML renderer |
| `src/components/seo/JsonLd.tsx` | The single sanctioned JSON-LD emitter; server-built data only |
| `src/lib/queries/public/stories.ts` | Published story reads; the only place `status = PUBLISHED` is applied |
| `src/lib/queries/public/story-detail.ts` | One published story, its published chapter list, and its related rail |
| `src/lib/queries/public/chapters.ts` | Published chapters, siblings, prev/next, counts |
| `src/lib/format.ts` | Deterministic date and short-description formatting, server-side |
| `src/app/api/images/[...key]/route.ts` | Authorized cover route; the only public cover source |

## Implementation rules

### Public-visibility enforcement

- Every reader read goes through `src/lib/queries/public/`. A page or component writing `status: "PUBLISHED"` itself is a bug: the filter then has two owners and the next caller forgets it.
- A story is public as soon as it is `PUBLISHED`, whether or not it has a published chapter. The detail query returns `{ story, chapters, chapterCount, hasPublishedChapters }`; the page gates the chapter list and the "Start reading" action on `hasPublishedChapters` instead of hiding the story. It shows no chapter-related notice.
- Chapter counts, category counts, rails, and related lists count only `PUBLISHED` chapters. A count including drafts leaks unpublished volume through arithmetic.
- Prev/next resolve in the query layer (`chapters.ts`) over the published chapter list the by-index also needs: ordered by `chapterNumber`, `status = PUBLISHED` only, bodies not selected. Never compute neighbours in the view, and never offer an unpublished sibling.
- Positions shown to the reader are the 1-based position in the published sequence, not the stored `chapterNumber`; a gap left by a draft cannot leak unpublished volume through arithmetic.
- A `DRAFT` or `ARCHIVED` story or chapter returns the identical `notFound()` as an unknown slug: no redirect, no distinct status code, no "this one is a draft".
- For that to be a real `404`, no `loading.tsx` may sit above the route: a streamed fallback commits `200` first. Catalogue and home loading skeletons live in route groups (`(home)`, `stories/(catalogue)`, `categories/(catalogue)`) so detail routes never inherit one.
- Related stories derive from `categoryId` and `StoryTag`, exclude the current story, filter `PUBLISHED`, cap at 4, in one query. No per-card query.

### Home page composition

- Fixed, server-derived order: featured (`featured = true`, `PUBLISHED`), then recently published by `publishedAt` descending, then categories holding at least one published story.
- Cap at 6 featured and 12 recent. Both are capped queries, never a `findMany` trimmed in JavaScript.
- A section with nothing to show is omitted entirely, heading included. No "coming soon" panel.
- The hero states something true from the catalog: published story count, latest title, or a featured story. Never invented reader counts.
- The first above-the-fold cover is the LCP candidate and the only `priority` image on the page.

### Listing and grid

- One grid, one card, shared by home, `/stories`, category pages, search results, and related rails. No page-local card markup.
- Single column below `sm`, two from `sm`, three from `lg`. Cards stretch to equal height; the card body is a flex column with the title at the top and metadata pinned to the bottom so rows align regardless of short-description length.
- Excerpt clamped to a fixed line count in CSS (`line-clamp`), never sliced in JavaScript.
- Default order `publishedAt` descending, `slug` ascending as a stable tiebreak. Sort keys come from a server-side whitelist; anything else falls back and is never interpolated.
- `/stories` accepts `q`, `category`, `tag`, `sort` and `page`. Values are validated and normalized server-side before the query; an unknown `sort` falls back to `recent`, a malformed slug or page is discarded, and `page` is clamped. Filtering state lives in the URL, so a result is shareable and works without JavaScript. The unfiltered view is canonical; filtered views are `noindex`.

### Story detail page

- Order: cover, `<h1>` title, category link, published date, short description, primary "Start reading" action, tag list, chapter list, related stories. The `<h1>` is the story title.
- "Start reading" renders only when `hasPublishedChapters`; otherwise it is omitted, not disabled.
- The chapter list shows published chapters ascending by `chapterNumber`, each with ordinal, title, and date.
- Category and tags are real links to their public routes. Breadcrumb Home / Category / Story title, `aria-current="page"` on the last item.
- `generateMetadata` sets title, description, canonical, Open Graph and Twitter. JSON-LD emits `Article` and `BreadcrumbList` built from published data through `src/components/seo/JsonLd.tsx` only.

### Chapter reading interface

- One centred column, `max-w-[70ch]` prose block, inside the 65–75 character measure from ui-ux.
- Body renders through `src/components/chapters/RichText.tsx` and nowhere else. Its allowlist lives in `src/lib/sanitize/rich-text.ts` and runs again on render, so stored HTML is never trusted; it also offsets stored heading levels so the page keeps one `<h1>`.
- Content headings are offset one level in that renderer: the page `<h1>` is the chapter title, stored `h1`/`h2` become `h2`/`h3`. Levels never skip and content cannot add a second `h1`.
- Typography for sanitized HTML comes from an explicit block keyed to allowlisted tags. No class names read from stored HTML, no inline `style` from content trusted.
- Story title appears as breadcrumb and return link, never as a competing heading. Published date sits in `<time dateTime={ISO}>` generated server-side.
- Nothing floats over the prose column: no sticky overlay, chat widget, newsletter modal, or share bar.

### Progress and chapter navigation

- `ReadingProgress` is the only client component on a chapter page: a thin bar with reserved height so it cannot shift layout, `aria-hidden` plus a visually hidden percentage for assistive technology.
- `position: sticky` at the top of the reading column, never `fixed` over content, transitions removed under `prefers-reduced-motion`.
- Bounds computed with passive listeners and one `requestAnimationFrame` throttle; no scroll handler writes layout properties outside that frame.
- Previous and next carry real labels ("Previous chapter", "Next chapter") plus the sibling title. A bare arrow icon is not the accessible name.
- By-index is a labelled list of published chapters with `aria-current="page"` on the current one, a disclosure on small viewports, fully keyboard operable.
- Absent neighbours are omitted, not disabled: no previous on the first published chapter, no next on the last. Links point at `/stories/{storySlug}/chapter/{chapterSlug}`, never at an id.
- By-index is the shared `ChapterRows` list inside `ChapterIndex`, a native `<details>` disclosure; no second row implementation and no script.

### Pagination, covers, determinism

- Paginate in the query layer: default 12 per page, hard maximum 48, `page` clamped to a positive integer. Page numbers are real `<a>` links, so they are crawlable and shareable.
- Show a real range ("Showing 13–24 of 57"), previous and next with `aria-disabled` plus an accessible reason at the boundaries, inside `<nav aria-label="Pagination">`. Page query and total count run concurrently.
- Preserve route context across pages: on `/search` both `q` and `page` carry over; on `/stories` every filter (`q`, `category`, `tag`, `sort`) carries over and only `page` changes. Never render an unbounded list and paginate in the browser.
- Covers come only from the image route or a CDN URL. `next/image` with explicit `width` and `height` matching the enforced aspect ratio, plus a `sizes` value reflecting the real grid slot. Never `unoptimized`.
- `alt` is the story title where the cover carries meaning, `alt=""` where the adjacent title already names the story. A missing `coverImage` renders the shared placeholder at fixed dimensions, never a broken image.
- Dates and short descriptions format through `src/lib/format.ts` with a fixed locale and time zone, server-side only. Card short descriptions come from stored `Story.shortDescription`, never from raw HTML in a component.

## Security requirements

- Sanitized chapter HTML renders only through `src/components/public/rich-text.tsx`. Any new `dangerouslySetInnerHTML` that renders stored HTML outside it is a review blocker. The only other sanctioned use is JSON-LD via `src/components/seo/JsonLd.tsx` (server-built object, `<` escaped).
- The renderer re-sanitizes on output as defence in depth for rows predating write-time sanitization, stripping `javascript:`, `data:`, and `on*` attributes.
- The cover route verifies the key belongs to a `PUBLISHED` story before streaming bytes; a `DRAFT` story's key returns the same 404 as an unknown key.
- `UPLOAD_MAX_BYTES` and the format allowlist are enforced on write. The reader surface trusts none of that data, and `next/image` is the only public image renderer.
- Reader pages render no draft title, short description, chapter count, category count, or cover. The public query is the enforcement point; components are not a second line of defence.
- No `console.log`. Failures render a safe message in the route's error boundary; detail goes to the project logger under a request id.
- No Prisma messages, bucket keys, env values, or stack traces reach a reader page. `notFound()` for absent and non-published content, generic error boundary for the rest.

## Testing requirements

Unit (Vitest):

- Prev/next resolution against a fixture with gaps in `chapterNumber` and interleaved drafts.
- The no-published-chapters decision: a `PUBLISHED` story with zero published chapters still resolves, with an empty chapter list and no start action.
- Deterministic date and short-description formatting independent of the ambient time zone.
- Page clamping for `0`, `-1`, `abc`, `999999`, and a page beyond the last.
- The renderer offsets heading levels, strips `<script>`, and strips a `javascript:` href.

Integration (real PostgreSQL):

- A `DRAFT` story holding a `PUBLISHED` chapter is absent from home, listing, category, related rails, sitemap, and every count.
- A `PUBLISHED` story whose only chapter is `DRAFT` resolves with an empty chapter list, no start action, and no siblings.
- Prev/next skip `DRAFT` and `ARCHIVED` chapters in both directions.
- Home and category counts match seeded fixtures exactly, drafts excluded.

E2E (Playwright):

- Browse to a story, read chapter one, follow next to the last, confirm no next at the end and no previous at the start.
- Open by-index, jump to a middle chapter, confirm `aria-current` moved.
- Land on a story with no published chapters and assert the page renders with no chapter list and no start action, not a crash.
- From `/stories`, search `q`, filter by category and tag, sort, paginate back and forth, and confirm every filter survives; land on a filtered view with no matches and assert the distinct "no matches" empty state.
- Axe clean on every reader route; tab through header, chapter nav, and pager; no horizontal overflow at 375px; progress present and not overlapping the prose column.

## Common mistakes

| Mistake | Why it is wrong | Fix |
| --- | --- | --- |
| Page writes `status: "PUBLISHED"` itself | Two owners for one filter | Query through `src/lib/queries/public/` only |
| Chapter list from a story `include` | Pulls draft and archived bodies into the payload | Query published chapters, `select` the fields used |
| Prev/next computed in the component | Offers a draft sibling, fetches every chapter | Resolve neighbours in the query layer |
| Counts include drafts | Leaks unpublished volume | Count published rows only |
| `findMany` then `.slice()` | Ships every row to trim it | Capped, ordered `take` in the query |
| Chapter-related notice on an unreadable story | Nagging copy about a missing chapter | Omit the chapter list and start action silently |
| Prose wider than 75ch | Long-form readability failure | `max-w-[70ch]` block |
| `fixed` progress bar over the text | Covers the prose column | `sticky` inside the column, reduced-motion aware |
| Client-rendered relative timestamps | Hydration mismatch, unstable output | Server format with fixed locale and zone |
| Cover without dimensions, broken when missing | Layout shift and a false signal | Explicit dimensions plus a placeholder |
| Draft preview at a public URL | Draft content becomes public | Preview lives under `/admin` only |

## Completion checklist

- [ ] Every reader read goes through `src/lib/queries/public/`; no call site writes the status filter.
- [ ] Visibility requires only that the story is `PUBLISHED`; a published story with no published chapters is listed and indexable, and its page omits the chapter list and start action without a chapter-related notice.
- [ ] Zero published chapters renders no chapter list and no start action, and no chapter-related notice.
- [ ] Prev/next and by-index offer `PUBLISHED` siblings only, resolved in the query layer.
- [ ] All counts, rails, and related lists exclude `DRAFT` and `ARCHIVED`; non-published slugs return the same `notFound()` as unknown ones.
- [ ] Prose measure 65–75 characters, one centred column, nothing overlaying the text.
- [ ] Exactly one `<h1>` per page; stored headings offset one level, never skipped.
- [ ] Chapter body renders through `src/components/public/rich-text.tsx` only.
- [ ] Excerpts line-clamped in CSS; dates in `<time dateTime>`; both server-formatted.
- [ ] `/stories` filters validated and normalized server-side; `page` clamped positive, page size 12; pager shows a real range; `q` and filters preserved across pages; filtered views `noindex`.
- [ ] Prev/next omitted at the boundaries rather than disabled; absent-neighbour links never rendered.
- [ ] Every cover uses `next/image` with explicit `width`, `height`, and a real `sizes` value; placeholders keep fixed dimensions.
- [ ] Exactly one `priority` image on the home page; `ReadingProgress` is the only chapter-page client component and causes no layout shift.
- [ ] Semantic landmarks, skip link first in focus order, breadcrumbs with `aria-current`, pager in a labelled `<nav>`.
- [ ] Verified at 375px, 768px, 1280px with no horizontal overflow; payloads measured before any performance claim.
- [ ] No `console.log`, no internal detail in reader-facing errors.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.