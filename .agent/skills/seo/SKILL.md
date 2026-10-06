# Skill: SEO

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md section 16 requires metadata on every public route, JSON-LD, a sitemap, and a `robots.ts`. This skill supplies the rest: the route-by-route metadata contract, canonical construction from `NEXT_PUBLIC_APP_URL`, Open Graph and Twitter assembly, OG image URLs for covers and the fallback, the JSON-LD schemas with valid field types, sitemap generation from the shared public query layer with `lastmod` from `publishedAt`, the `robots.ts` rules, the slug-change decision, heading hierarchy, internal linking, and the thin-content signals that quietly degrade a page. Metadata is server-derived from published data or it is a bug: a draft row in a `<title>` tag is a disclosure, not a description.

## When to use

- Adding or changing a public route, its `generateMetadata`, or `generateStaticParams`.
- Changing `metadataBase`, the root title template, a JSON-LD builder, or `src/components/public/json-ld.tsx`.
- Changing `src/app/sitemap.ts`, `src/app/robots.ts`, or the public query layer they consume.
- Changing how cover URLs are built for social cards, or how a slug is changed.
- Investigating a thin-content, duplicate, or unindexable page.

## Relevant files

| Path | Role |
| --- | --- |
| `src/app/layout.tsx` | `metadataBase`, title template, default Open Graph, `lang` |
| `src/lib/seo/canonical.ts` | Canonical, OG, and absolute-URL builders from `NEXT_PUBLIC_APP_URL` |
| `src/lib/seo/metadata.ts` | Shared `buildMetadata` helpers used by every public route |
| `src/lib/seo/json-ld.ts` | `buildStoryJsonLd`, `buildBreadcrumbJsonLd`, `buildWebSiteJsonLd` |
| `src/components/public/json-ld.tsx` | Renders JSON-LD safely; the only place it is serialized |
| `src/app/(public)/stories/[slug]/page.tsx` | Story metadata plus `Story`/`Article` JSON-LD |
| `src/app/(public)/stories/[slug]/chapter/[chapterSlug]/page.tsx` | Chapter metadata, breadcrumb, `noindex` when thin |
| `src/app/(public)/search/page.tsx` | Result metadata, `noindex`, canonical `/search` |
| `src/app/sitemap.ts` | Built only from `src/lib/queries/public/` |
| `src/app/robots.ts` | Disallows `/admin`, `/admin/login`, `/api/` |
| `src/app/api/images/[...key]/route.ts` | Cover bytes and the OG image URL target |
| `public/og-default.png` | Static fallback Open Graph image, 1200×630 |

## Implementation rules

### Route metadata contract

| Route | `title` | Canonical | Indexing | JSON-LD |
| --- | --- | --- | --- | --- |
| `/` | Site name, or the featured story title | `/` | index | `WebSite` |
| `/stories` | "All stories" | `/stories` | index | `BreadcrumbList` |
| `/stories` page 2+ | "All stories – page 2" | `/stories?page=2` | index, follow | `BreadcrumbList` |
| `/stories/[slug]` | `Story.title` | `/stories/{slug}` | index when a chapter is published, else `noindex` | `Story`, `Article`, `BreadcrumbList` |
| `/stories/[slug]/chapter/[chapterSlug]` | `{chapter} – {story}` | `/stories/{slug}/chapter/{chapterSlug}` | index | `Article`, `BreadcrumbList` |
| `/categories` | "Categories" | `/categories` | index | `BreadcrumbList` |
| `/categories/[slug]` | `Category.name` | `/categories/{slug}` | index when it holds a published story, else `noindex` | `CollectionPage`, `BreadcrumbList` |
| `/search?q=` | "Search" | `/search` | `noindex, follow` | none |
| `/admin/login` | "Sign in" | none | `noindex, nofollow` | none |
| `/admin/**`, preview | none | none | `noindex, nofollow` | none |
| Missing or unpublished slug | none | none | `notFound()` | none |

- Every public route exports `generateMetadata`; a route without it is incomplete, not merely bare. Titles use the root title template, so a route returns the leaf value only, never a repeated site name.
- Descriptions come from stored server-derived text: `Story.shortDescription` or the thin-content fallback. Never a hardcoded string, never a slice of raw HTML. Titles clamp at 60 characters, descriptions at 155, always on a word boundary with `…`, never mid-word.
- `openGraph.type` is `website` for listings and `article` for stories and chapters. `twitter.card` is `summary_large_image` with a cover and `summary` without, so Twitter never renders a stretched thumbnail.

### Canonical and URL construction

- Every URL comes from `src/lib/seo/canonical.ts`, which reads `NEXT_PUBLIC_APP_URL`. No page assembles a URL string by hand and no absolute URL is written in source.
- Construction is `new URL(path, metadataBase)` with `path` a leading-slash path, which resolves correctly with a base carrying a trailing slash, a sub-path, or a port.
- `metadataBase` is set once in `src/app/layout.tsx` and validated as an absolute URL. A missing or relative value fails at startup through the env schema rather than emitting a broken canonical.
- Canonical is absolute, https in production, lowercase host, no trailing slash except at the root, no `utm_*`, no session parameter, no fragment, no double slash.
- Canonical points at the URL that serves the content. Page 2 keeps `?page=2` because it is different content; `?page=1` does not exist and is never canonicalized.
- Every indexable page self-references its canonical, and a `noindex` page emits none. Page links are real `<a>` links to crawlable URLs; `rel="prev"` and `rel="next"` are not a substitute for links.

### Open Graph and Twitter

- `openGraph.url` equals the canonical; `og:title` and `og:description` reuse the metadata values rather than re-deriving them, which is also why they can never carry a draft value.
- The OG image is an absolute URL from the authorized image route or CDN with `width: 1200`, `height: 630`, and `alt` equal to the story title. Covers are not square, so request the crop and resize that reaches 1200×630 rather than shipping a portrait original as the social card.
- No cover means `public/og-default.png` as the OG and Twitter image with descriptive alt. Never a blank image, never a broken URL, never an omitted image where the card would be empty.
- `twitter.site` and `twitter.creator` come from one constants module. No invented handles: with no verified account, omit the fields.

### JSON-LD

| Property | Type | Source | Rule |
| --- | --- | --- | --- |
| `@context` | string | constant | `https://schema.org`, exactly |
| `@type` | string | constant | `Story` and `Article` on a story page, `Article` on a chapter page |
| `headline` | string | `Story.title` | Required, clamped, non-empty |
| `description` | string | `Story.shortDescription` or fallback | Required. Never an empty string |
| `url` | string | canonical | Absolute, https in production |
| `mainEntityOfPage` | object | canonical | `{"@type":"WebPage","@id":url}` |
| `image` | string | cover or default OG | Absolute URL, 1200×630. Never a storage key |
| `datePublished` | string | `Story.publishedAt` | ISO 8601 **string**, never a `Date` object |
| `dateModified` | string | latest story update or chapter publish | ISO 8601 string |
| `articleSection` | string | `Category.name` | Omit when null, never `""` |
| `keywords` | string | joined `Tag.name` | Comma-separated; omit when there are no tags |
| `publisher` | object | constants | `Organization` with `name` and an absolute `logo` URL |
| `author` | not applicable | absent from the data model | **Omit.** Never invent one to satisfy the schema |
| `isPartOf` | object | owning story | On a chapter: a `Story` reference with `url` and `name` |
| `wordCount` | number | counted from `contentText` | Server-derived, never a client estimate |
| `BreadcrumbList.itemListElement` | array of `ListItem` | route trail | `position` a 1-based **number**, `name` a string, `item` absolute |
| `WebSite.potentialAction` | object | constants | `SearchAction` targeting `https://host/search?q={search_term_string}` |

- Serialize in `src/components/public/json-ld.tsx` only, replacing `<` with `\u003c` before `JSON.stringify` so a title containing `</script>` cannot close the element.
- Types are non-negotiable: dates as ISO strings, `position` as a number, URLs absolute, no `null`, no `undefined`, no empty string, no relative URL. Required-but-missing drops the node rather than emitting it with holes: a story with no usable description emits no `Article` node at all.
- JSON-LD comes from the same published query that renders the page, never from an admin query, a draft, or a preview. None on `/admin/**`, preview routes, or `/admin/login`.

### Sitemap and robots

- `src/app/sitemap.ts` returns `MetadataRoute.Sitemap` built exclusively from `src/lib/queries/public/`, never from `src/lib/queries/admin/`.
- Entries: `/`, `/stories`, `/categories`, every `PUBLISHED` category holding a published story, every `PUBLISHED` story with at least one published chapter, and every `PUBLISHED` chapter of those stories.
- `lastmod` is `Story.publishedAt` for stories and `Chapter.publishedAt` for chapters. Never `new Date()`: that makes every page look freshly edited, which is a lie crawlers learn to discount. `changeFrequency` and `priority` are coarse site-wide constants; varying them per URL to game crawlers is noise.
- No `/admin`, `/admin/login`, `/search`, query string, or `noindex` URL enters the sitemap, and every URL is absolute, built with the canonical builder. Past 50,000 URLs or 50 MB, split with `generateSitemaps` and reference the index.
- `src/app/robots.ts` allows crawling, disallows `/admin`, `/admin/login`, and `/api/`, sets `host` to the `NEXT_PUBLIC_APP_URL` origin, and lists the sitemap. It disallows nothing else: `/search` is handled by `noindex` in metadata, and disallowing the path while leaving `?q=` links crawlable is inconsistent.
- `robots.txt` is a crawl hint, never access control. `/admin/**` protection stays server-side in the layout and in every action.

### Slug changes and the broken-link tradeoff

Renaming the slug of a published story breaks every inbound link, bookmark, and index entry. Two acceptable outcomes, and choosing between them is a product decision that must be explicit:

1. **Redirect record (preferred).** A `StoryRedirect` row mapping the old slug to the story, written in the **same transaction** as the slug change so a rename cannot succeed without it; old URLs return `301` to the new canonical. This needs a schema addition: new model, index on the old slug, committed migration, and an update to the AGENTS.md data model contract. Do not introduce it as an unannounced side effect of a rename.
2. **Explicit acknowledgement.** No redirect. The old URL returns `404`, the story reappears in the sitemap under the new slug, and inbound links break. Acceptable only when written down, not as an accident.

- Never emit a redirect chain, never redirect a new slug back to an old one, never leave two slugs resolving to one story.
- The canonical follows the new slug, the sitemap `lastmod` reflects the change, and revalidation covers the old URL's cached page. A chapter slug follows the same rule, scoped to one `storyId`.

### Heading hierarchy and internal linking

- Exactly one `<h1>` per page, naming the page's primary content: the story title on a story page, the chapter title on a chapter page, the site or a featured story on the home page.
- Content headings are offset one level by the rich-text renderer, so stored `h1`/`h2` become `h2`/`h3`; content can never add a second `h1` or skip a level. Levels follow DOM order, not visual size, and a `<div>` is never styled to look like a heading.
- Every published story is internally linked from at least one of: home (featured or recent), its category page, a related-stories rail, or another story's related rail. A story reachable by no internal link is an orphan and will not rank.
- Category and tag links on a story page, prev/next on a chapter page, and the breadcrumb on every public page are the internal link graph. Breadcrumbs mirror the visible URL trail exactly, link text is descriptive ("Read chapter 3", not "click here" or a grid of "read more"), and external links use `rel="noopener noreferrer"`.

### Thin content

| Signal | Detection | Handling |
| --- | --- | --- |
| Empty `Story.shortDescription` | Null or whitespace after trim | Derive from the first published chapter's `contentText`, clamped to 155 characters on a word boundary, server-side |
| Excerpt under 70 characters | Length check | Treat as thin and prefer the longer, still faithful derived fallback |
| No published chapters | `hasPublishedChapters` is false | Render the explicit empty state, set `robots: { index: false, follow: true }`, omit from the sitemap, emit no `Article` node |
| Missing cover | `coverImage` is null | Default OG image, placeholder in the grid, `image` still a real absolute URL |
| No tags and no category | Both null | Omit `articleSection` and `keywords` rather than emitting empty values |
| Chapter under roughly 200 words | `wordCount` from `contentText` | Keep indexable, exclude from rails. Never pad it |

- Thin content is fixed at the source in admin: a short description is written, chapters are published, a cover is uploaded. The public surface degrades gracefully and never invents copy to fill a gap. A `noindex` page still returns `200` with its content, because `noindex` is a crawler hint, not a privacy control and never a substitute for the `PUBLISHED` filter in the query layer.

## Security requirements

- Metadata, canonical URLs, and JSON-LD are built only from the published public query layer. A draft title in a `<title>` tag, an OG tag, or a JSON-LD node is a content disclosure and a review blocker.
- `NEXT_PUBLIC_APP_URL` is read through the validated env schema. A relative or malformed value fails fast at startup rather than emitting a broken or attacker-shaped canonical.
- No env value, bucket key, storage endpoint, internal hostname, session value, or Prisma message reaches metadata, JSON-LD, `robots.txt`, or the sitemap.
- JSON-LD is serialized only by `src/components/public/json-ld.tsx` with `<` escaped. No page inlines a JSON-LD string itself.
- Old-slug redirects are server-generated from a database record, never from a user-supplied `next` parameter, and never reflect the requested path into `Location`.
- `robots.txt` and `noindex` are crawl hints; `/admin/**` and `/admin/login` are protected server-side in the layout and in every Server Action. Hiding a route from crawlers never protects it.
- Covers in OG tags resolve through the authorized image route or CDN. Storage credentials and raw keys never appear in a public URL, and a key belonging to a `DRAFT` story is not served.
- No `console.log`. SEO failures log through the project logger under a request id with safe messages only.

## Testing requirements

Unit (Vitest):

- Canonical builder against a base with a trailing slash, a sub-path, a port, and a path already carrying a query string; a missing or relative `NEXT_PUBLIC_APP_URL` produces a startup failure, not a broken canonical.
- Clamping at 60 and 155 characters lands on a word boundary with `…`; the short-description fallback derives from `contentText` and returns an empty string rather than markup when there is no content.
- JSON-LD builders emit ISO-string dates, numeric `position`, absolute URLs, and drop a node missing a required field; serialization escapes `<` so a title containing `</script>` cannot terminate the element.
- OG image construction with and without a cover, always absolute and 1200×630.

Integration (real PostgreSQL):

- The sitemap contains every published story with a published chapter plus its published chapters, and no draft, archived, `/admin`, `/admin/login`, or `/search` entry; `lastmod` equals `publishedAt`, not request time, and two builds are identical.
- A story whose chapters are all `DRAFT` is absent from the sitemap and its detail metadata sets `noindex`. Sitemap rows match the public query layer exactly, and unpublishing removes the story after revalidation.

E2E (Playwright):

- Assert `link[rel=canonical]` has the expected absolute href on home, story, chapter, and category pages, and that `og:title`, `og:description`, `og:image`, `og:url` match visible content with `twitter:card` reflecting cover presence.
- Parse the JSON-LD script; assert `headline`, `url`, `datePublished` types and values, and 1-based numeric breadcrumb positions.
- `/search?q=anything` carries a `noindex` directive and a canonical of `/search` with no query. `/robots.txt` disallows `/admin` and `/admin/login` and lists the sitemap.
- Visit a draft story URL anonymously: `404`, and no draft title in the `<title>`, OG tags, or JSON-LD anywhere in the response.
- Rename a published story with a redirect record in place; the old URL returns a single `301` to the new canonical.

## Common mistakes

| Mistake | Why it is wrong | Fix |
| --- | --- | --- |
| Hand-written absolute URL in source | Wrong host in preview, wrong scheme in production | Build through `src/lib/seo/canonical.ts` |
| `lastmod: new Date()` | Every URL claims a fresh edit | Use `publishedAt` |
| `datePublished` as a `Date` object | Invalid schema type, dropped by consumers | ISO 8601 string |
| `author` invented to satisfy `Article` | The field does not exist in the data model | Omit it |
| Empty-string `description` or `keywords` | Invalid value, no fallback benefit | Derive it or omit the property |
| OG image as a raw storage key | Not resolvable by a crawler | Absolute URL via the image route or CDN |
| Square cover shipped as the social card | Cropped or letterboxed by every platform | Request a 1200×630 variant |
| Sitemap built from the admin query | Publishes drafts and archived stories | Build from `src/lib/queries/public/` |
| `robots.txt` used to protect `/admin` | A crawl hint is not access control | Server-side guards in layout and actions |
| Renaming a published slug with no decision | Breaks inbound links silently | Redirect record, or a written trade-off |
| No published chapters but left indexable | Indexes an empty page as thin content | `noindex`, omit from sitemap, no `Article` node |
| Two `h1`s, one from stored content | Breaks hierarchy and the document outline | Offset content headings in the renderer |
| Canonical on a `noindex` page, or `?page=1` kept | Contradictory signals, duplicate URL | No canonical when `noindex`; canonical without it |
| JSON-LD inlined in a page component | `</script>` in a title breaks out | One serialization component, `<` escaped |

## Completion checklist

- [ ] `metadataBase` set once from a validated `NEXT_PUBLIC_APP_URL`; every public route exports `generateMetadata`.
- [ ] All URLs built through `src/lib/seo/canonical.ts`; no hand-written absolute URL in source.
- [ ] Canonical absolute, https in production, no `utm_*`, no fragment, no `?page=1`, self-referencing, absent on `noindex` pages.
- [ ] Titles clamped at 60 and descriptions at 155 on a word boundary, from stored server-derived text.
- [ ] `og:type` `website` for listings and `article` for stories and chapters; `twitter.card` matches cover presence; no invented handles.
- [ ] OG image absolute, 1200×630, with alt; `public/og-default.png` used when no cover exists.
- [ ] JSON-LD built only from the published public query, serialized only by `src/components/public/json-ld.tsx` with `<` escaped.
- [ ] ISO 8601 dates, numeric `position` and `wordCount`, absolute URLs, no `null` or empty strings; `author` omitted, never invented.
- [ ] `Story`/`Article` on story pages, `Article` plus `isPartOf` on chapters, `BreadcrumbList` on every public page, `WebSite` on the root.
- [ ] Sitemap built only from `src/lib/queries/public/`; `lastmod` from `publishedAt`, never `new Date()`; absolute URLs only.
- [ ] Only `PUBLISHED` stories with a published chapter, their published chapters, and non-empty categories in the sitemap.
- [ ] No `/admin`, `/admin/login`, `/search`, query strings, or `noindex` URL in the sitemap; `robots.ts` sets `host`, the sitemap entry, and the three disallows.
- [ ] Slug-change decision made explicitly; redirect record written in the same transaction, or the trade-off recorded.
- [ ] Exactly one `<h1>` per page; content headings offset one level; no skipped levels; no orphan published stories.
- [ ] Thin-content table handled: derived short description, `noindex` for no published chapters, default OG image, omitted empty fields.
- [ ] No draft title, short description, cover, or count in any metadata, JSON-LD, sitemap, or robots output.
- [ ] No env value, storage key, internal hostname, or Prisma message in any SEO output; no `console.log`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.