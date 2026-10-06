# Skill: Search

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md sections 6, 9, 14, and 16 fix search in outline: only `PUBLISHED` content is public, input is validated at the server boundary, raw SQL uses tagged templates only, the route is `/search?q=`. This skill supplies the rest: the query-string contract, the Zod schema and clamps, whitespace and unicode normalization, escaping before any query builder, the chosen full-text search implementation and the index it requires, which fields are searched and weighted, how `PUBLISHED` is enforced inside the query layer, pagination and counts, the empty and no-result states, and the exclusion of `DRAFT` and `ARCHIVED` from results and counts.

## When to use

- Creating or changing `/search`, the `SearchBar`, or the results listing.
- Changing `src/lib/validation/search.ts` or the normalization helpers.
- Changing `src/lib/queries/public/search.ts`, the SQL it runs, or the ranking.
- Adding a searchable field, a tsvector weight, or the tsvector column and its index.
- Changing search pagination or result counts.
- Diagnosing relevance, ranking, snippet, or performance problems.

Not for admin search over drafts, nor for category or tag filtering, which have their own routes.

## Relevant files

| Path | Role |
| --- | --- |
| `src/app/(public)/search/page.tsx` | `/search?q=` route: form, results, count, pagination |
| `src/components/public/search-bar.tsx` | The form; submits `GET` with `name="q"` |
| `src/components/public/search-result.tsx` | One result row: title, snippet, category, date |
| `src/lib/validation/search.ts` | `searchQuerySchema`, `searchPageSchema`, normalization |
| `src/lib/queries/public/search.ts` | The only search query; enforces `PUBLISHED` internally |
| `src/lib/db.ts` | Prisma singleton; the only `$queryRaw` entry point |
| `prisma/schema.prisma` | `Story`, `Chapter`, `Tag`, `StoryTag`; `Chapter.contentText` |
| `prisma/migrations/*_search_index/` | Adds the tsvector columns and their GIN indexes |

## Implementation rules

### Route contract

| Aspect | Rule |
| --- | --- |
| Route | `/search?q=<term>&page=<n>` |
| Method | `GET` only. Search is navigation, never a mutation |
| Form | Plain `<form action="/search" method="get">`, works without JavaScript |
| `q` | The reader's term, clamped and normalized server-side, never trusted as typed |
| `page` | Optional positive integer, default 1, clamped to the last available page |
| Canonical | `/search` without `q`; result pages are `noindex` (see the seo skill) |
| Page size | 10 results, hard maximum 25 |
| Cache | Short `revalidate`, keyed on normalized term plus page, revalidated on publish |

- No other parameters: no facets, no sort, no range. Anything new arrives through a validated schema, never by reading raw `searchParams`.
- Absent or blank `q` renders the form plus a browse affordance: a 200 page that runs no query.

### Validation and normalization

`src/lib/validation/search.ts` owns the contract. The order is deliberate:

1. Reject anything that is not a string.
2. `normalize("NFKC")` so full-width and compatibility forms fold to one representation.
3. Strip control characters, `\u0000` through `\u001F` and `\u007F` included.
4. Strip zero-width characters `\u200B`–`\u200D` and `\uFEFF`, which break exact matching silently.
5. Collapse internal whitespace runs to one space, then trim.
6. Enforce `min(2)` after normalization: a one-character query is a browse request.
7. Enforce `max(128)`. A longer term is rejected, never silently truncated.
8. Strip unknown keys; the parsed object, not raw `searchParams`, is passed onward.

- `searchPageSchema` is `z.coerce.number().int().min(1).max(10_000)` defaulting to 1, then clamped against the real page count after the query. Out-of-range renders the last page or page 1; it never throws and never serves an empty page 999.
- Types come from the schemas with `z.infer`; the page never redeclares the shape.
- Validation failure is not a throw and not a 500. An invalid term renders the empty state with the form preserving what the reader typed.

### Escaping and the query builder

- The term reaches PostgreSQL only as a bound parameter of a `prisma.$queryRaw` tagged template. `$queryRawUnsafe` is never used here, and nothing is concatenated between validation and the SQL call.
- The parser is `websearch_to_tsquery('english', ${term})`, never `to_tsquery`, which raises a syntax error on input like `foo & | bar` and turns a search into a 500.
- Never build an `ORDER BY`, a `WHERE` fragment, or a tsquery string by concatenation. A numeric-looking term is still a string until PostgreSQL casts it.
- No `LIKE` fallback on this path. Prefix or fuzzy matching, if ever added, is a separate validated parameter with its own tests.

### Chosen implementation: PostgreSQL full-text search

Native PostgreSQL full-text search over a **stored generated `tsvector` column with a GIN index**, queried through `prisma.$queryRaw` with tagged templates. Prisma `contains` is not used for free text: it cannot rank, cannot match across chapters and tags at once, and degrades to an unindexed scan as the table grows. The migration owns the vector, so no write path and no application code maintains it:

```sql
ALTER TABLE "Story"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("shortDescription", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("categoryName", '')), 'C')
  ) STORED;

CREATE INDEX "Story_searchVector_idx" ON "Story" USING GIN ("searchVector");
```

- `'english'` is a deliberate choice applied consistently to the column, the query, and ranking, because it gives stemming and stopword handling. Changing it later means a migration rebuilding every vector and index, so it is recorded here rather than left implicit.
- Chapter text is never searched as raw HTML. `Chapter.contentText` holds server-derived plain text written alongside the sanitized HTML and carries its own generated vector and GIN index. Indexing markup as prose pollutes relevance, and joining a draft chapter would leak admin content into ranking.
- The chapter vector joins to `Story` only through a `PUBLISHED` chapter row, so the join doubles as a visibility filter.

### Searched fields and behaviour

| Field | Source | Weight | Notes |
| --- | --- | --- | --- |
| `Story.title` | stored | `A` | Highest weight; a title match outranks a body match |
| `Story.shortDescription` | stored, server-derived plain text | `B` | Never computed from raw HTML at query time |
| `Category.name` | join | `C` | On the story vector; matches case-insensitively |
| `Tag.name` | `StoryTag` join | `C` | Surfaces tags the story detail page already exposes |
| `Chapter.title` | stored | `C` | Lets readers find "chapter 7" style queries |
| `Chapter.contentText` | plain text from sanitized HTML | `D` | Strongest long-form signal; joined through published chapters only |
| `Story.slug` | stored | not indexed | A URL artifact, not content. Skip it |

- A story is returned once even when several chapters or tags match. Deduplicate in SQL with `GROUP BY` on the story, or `DISTINCT ON`, **before** `LIMIT`; deduping after pagination silently drops results.
- Ranking is `ts_rank_cd("Story"."searchVector", query, 32)` plus the best matching chapter rank, with `publishedAt` descending as a stable tiebreak. Two runs on the same data must return the same order, or pagination repeats and skips rows.
- Rank `0` rows are excluded. A stopword-only term under `'english'` yields an empty tsquery, which renders the no-result state with a hint, never a 500 and never a full unfiltered listing.
- Snippets come from `ts_headline` over `Chapter.contentText` or `Story.shortDescription`. That output is untrusted text: markers become React elements, never injected HTML, and no `dangerouslySetInnerHTML` renders a snippet.

### Visibility, counts, pagination, states

- `status = PUBLISHED` is applied **inside** `src/lib/queries/public/search.ts`, to the story row and the joined chapter row. The page never adds it and no parameter disables it.
- Counts come from the same filtered query via `COUNT(*) OVER ()`, never an unfiltered `story.count()`, so total and rows cannot disagree. A count including drafts reveals unpublished volume; that is a disclosure, not rounding.
- Page size 10, hard maximum 25, offset pagination with `LIMIT`/`OFFSET`. An unbounded match set is never fetched to paginate in the browser.
- Pagination preserves `q` on every link, page numbers are real links, and the range ("Showing 11–20 of 34") is server-derived.
- Results carry a cache tag revalidated by the admin publish and unpublish actions, so newly published stories become findable without waiting out the revalidation window.
- Four distinct states: **no query** (form plus browse links, no database call), **no results** (name the term, suggest broadening, keep the typed value), **loading** (a `loading.tsx` skeleton mirroring the result list, so a reader never reads "nothing found" while results load), **error** (a safe message in the route's error boundary with a retry affordance; detail to the project logger under a request id, never the Prisma message, the SQL, or the raw term).

## Security requirements

- The term is a bound parameter in a `$queryRaw` tagged template. No interpolation, no `$queryRawUnsafe`, no string-built SQL on any path including logging and error helpers.
- `status = PUBLISHED` on story and chapter is enforced in the query layer and cannot be switched off by a parameter. Draft and archived titles, short descriptions, chapter text, and counts never appear in results, snippets, or totals.
- The result count is filtered exactly as the results are. Snippets are escaped, and `ts_headline` markers render as elements, never as HTML.
- The page is public: no session data, no admin query, no draft preview, no edit or delete affordance.
- Result pages are `noindex` and excluded from the sitemap, so query-string permutations are not crawlable duplicates.
- `RATE_LIMIT_*` write limits do not apply to `GET` search. If volume becomes a cost or abuse vector, add a bounded limit keyed by IP in `src/lib/rate-limit/`; never degrade the query or cache by untrusted input.
- The term is user input and can carry PII. Log the normalized term and result count through the project logger at a chosen level; never log request bodies, session ids, or env values, and never echo the term into a user-facing error.

## Testing requirements

Unit (Vitest):

- Normalization: NFKC folding of full-width input, zero-width stripping, control-character stripping, whitespace collapsing, trim.
- Clamps: 0, 1, 2, 128, 129 characters, plus whitespace-only and stopword-only terms.
- `searchPageSchema`: `0`, `-5`, `1.5`, `abc`, `999999`, and a missing value.
- Snippet escaping: chapter content containing `<script>` and a quote never reaches the DOM as markup.
- Weighting and rank order against a fixed fixture, asserting two runs produce identical order.

Integration (real PostgreSQL):

- A `DRAFT` story whose title matches is absent from results **and** from the count; likewise an `ARCHIVED` story.
- A `PUBLISHED` story whose only match sits in a `DRAFT` chapter is not returned, and that text appears in no snippet.
- Chapter and tag matches surface the story exactly once, never once per matching chapter.
- The `COUNT(*) OVER ()` total equals the unpaginated match count with drafts excluded; page 2 returns the correct slice and the range string matches reality.
- Injection-shaped terms (`'; DROP TABLE "Story"; --`, `foo & | bar`, `1 OR 1=1`, `100%`) return zero or valid results, never an error, with the schema intact afterwards.
- Publishing through the admin action makes the story findable after revalidation.

E2E (Playwright):

- Submit the form by keyboard only, land on `/search?q=...`, confirm results and the count.
- Land on `/search` with no `q`; confirm no query ran and a browse affordance is offered.
- Search a term with no matches; confirm the no-result state keeps the typed term. Paginate; confirm `q` survives on every page link.
- Confirm the canonical URL excludes `q` and a `noindex` directive is present.
- Axe clean on `/search`; the term input has a real `<label>` and results sit in a landmark region.

## Common mistakes

| Mistake | Why it is wrong | Fix |
| --- | --- | --- |
| Interpolating the term into SQL | Injection, even behind "escaping" | Tagged template with a bound parameter |
| `to_tsquery` on raw input | Throws on `foo & bar`, 500 for the reader | `websearch_to_tsquery` |
| Prisma `contains` for free text | Unranked, no cross-field matching, table scans | tsvector plus GIN, ranked |
| `status` filtered in the page | The next caller forgets and drafts leak | Filter inside the query layer |
| Unfiltered `story.count()` | Reveals draft and archived volume | Count from the same filtered statement |
| Deduplicating after `LIMIT` | Drops results, truncates the list | Group by story in SQL before limiting |
| Ordering by `publishedAt` alone | Newest beats most relevant | `ts_rank_cd` with date as tiebreak only |
| Indexing `Chapter.content` (HTML) | Markup ranks as words, draft text leaks | Index `Chapter.contentText` |
| Missing tsvector GIN index | Correct but unindexed, slow on real data | GIN index in a committed migration |
| Stopword-only query listing everything | Leaks the unpublished catalog | Exclude rank `0` rows |
| `ts_headline` injected as HTML | Stored XSS from chapter content | Render markers as elements, escape text |
| Invalid term throwing | A 500 for a typo | Render the empty state, keep the input |
| Blank `q` running the query | Wasted work, odd cache keys | Short-circuit before any database call |

## Completion checklist

- [ ] `/search?q=&page=` only, `GET` only, no other parameters honoured.
- [ ] Zod schema applies NFKC, control-character and zero-width stripping, whitespace collapse, `min(2)`, `max(128)`.
- [ ] `searchPageSchema` coerces, clamps to 1..10000, then clamps to the real last page; types from `z.infer`.
- [ ] Blank `q` short-circuits before any database call; the page never reads raw `searchParams`.
- [ ] Term bound as a parameter in a `$queryRaw` tagged template; no `$queryRawUnsafe`; `websearch_to_tsquery` only.
- [ ] Stored generated tsvector columns with `A`–`D` weights and GIN indexes, shipped as a migration; `'english'` consistent everywhere.
- [ ] `Chapter.contentText` searched; raw HTML never indexed.
- [ ] `status = PUBLISHED` enforced inside the query layer on story and joined chapter.
- [ ] Counts from the same filtered statement; `DRAFT` and `ARCHIVED` excluded from results and totals.
- [ ] One row per story despite multi-chapter or multi-tag matches; dedupe before `LIMIT`.
- [ ] Ranked by `ts_rank_cd` with a deterministic tiebreak; rank `0` rows excluded; snippets escaped as text.
- [ ] Page size 10, maximum 25; pager preserves `q` and shows a real range; no client-side pagination.
- [ ] No-query, no-result, loading, and error states are distinct and designed.
- [ ] Result pages `noindex`, canonical `/search`, excluded from the sitemap.
- [ ] Unit, integration, and Playwright coverage above implemented, including injection-shaped terms.
- [ ] Term and count logged through the project logger only; no `console.log`, no Prisma message, SQL, or raw term in a user-facing error.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.