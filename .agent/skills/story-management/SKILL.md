# Skill: Story Management

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

- Own the lifecycle of the `Story` row: create, edit, delete, feature flagging, cover attachment, and publishing.
- Keep every story mutation in `src/actions/story.ts` and every read in `src/lib/queries/`. Pages never assemble Prisma calls for stories.
- Encode the publish state machine in one place, with its cascades, so no call site can half-publish a story.
- Keep `slug`, `shortDescription`, and `coverImage` correct for public SEO after every mutation.

## When to use

- Creating, editing, deleting, featuring, or unfeaturing a story.
- Publishing, unpublishing, archiving, or restoring a story.
- Attaching, replacing, or clearing `coverImage`.
- Changing `title`, `slug`, `shortDescription`, `categoryId`, or the tag set.
- Building or changing an admin story list, filter, or pagination control.
- Wiring or auditing cache invalidation for public story reads.

## Relevant files

| Path | Role |
| --- | --- |
| `src/actions/story.ts` | All story Server Actions, `'use server'`, typed results |
| `src/lib/validation/story.ts` | Zod schemas: create, update, list query, transitions |
| `src/lib/queries/stories.ts` | Public reads, `status = PUBLISHED` applied internally |
| `src/lib/queries/admin-stories.ts` | Admin reads, no status restriction |
| `src/lib/slug.ts` | `slugifyTitle` and `uniqueSlug` |
| `src/lib/excerpt.ts` | `deriveExcerpt` plain-text normalisation |
| `src/lib/storage/covers.ts` | Cover put/delete helpers (see the media-upload skill) |
| `src/lib/auth/permissions.ts` | `can(user, 'story:write')` style lookup |
| `src/components/admin/story-form.tsx` | React Hook Form + Zod resolver form |
| `src/components/admin/story-table.tsx` | Admin list rows, filters, pagination |
| `src/app/admin/stories/page.tsx` | Admin list page, composes only |
| `src/app/admin/stories/[id]/page.tsx` | Admin edit page, composes only |
| `tests/unit/story-slug.test.ts` | Slug generation and collision cases |
| `tests/integration/story-actions.test.ts` | Actions against the test database |

## Implementation rules

- One exported action per mutation in `src/actions/story.ts`: `createStory`, `updateStory`, `deleteStory`, `publishStory`, `unpublishStory`, `archiveStory`, `restoreStory`, `setFeatured`, `attachCover`, `removeCover`.
- Every action returns `ActionResult<T>`: `{ ok: true, data } | { ok: false, error: string, fieldErrors?: Record<string, string[]> }`. Never `throw` a Prisma error out of an action.
- Validate with the Zod schema before any database call. Schemas use `.strict()` so unknown keys are stripped, and the input type is `z.infer<typeof createStorySchema>`, never a hand-written duplicate shape.
- Slug generation, server side only, in `src/lib/slug.ts`:
  - Lowercase, strip diacritics via `NFKD`, replace every run of non `[a-z0-9]` with `-`, collapse repeated `-`, trim leading and trailing `-`.
  - Cap at 80 characters on a hyphen boundary. If the result is empty, fall back to `story`.
  - Collisions resolved by appending `-2`, `-3`, and so on, each checked with `prisma.story.findUnique({ where: { slug } })`.
  - A `P2002` unique violation on `Story_slug_key` after a concurrent insert is retried once with a fresh suffix, then returned as a typed field error. Never surface the raw Prisma message.
- Changing the slug of a `PUBLISHED` story requires either a `StorySlugRedirect` row written in the same transaction, or `confirmSlugChange: true` in the validated input, which the form must collect explicitly. Silent slug mutation of a live story is forbidden.
- `shortDescription` is plain text. `deriveExcerpt` trims, collapses internal whitespace, and truncates at the last word boundary at or before the limit. If the submitted short description is empty, store an empty string and let metadata generation fall back server-side; never store HTML in `shortDescription`.
- `categoryId` must be verified with `prisma.category.findUnique` before use. `null` means uncategorised and is allowed. An unknown id returns a typed error, not a foreign-key exception.
- Tag assignment is a full replacement inside one transaction. Dedupe `tagIds`, cap the count, then:
  - `prisma.$transaction([prisma.storyTag.deleteMany({ where: { storyId } }), prisma.storyTag.createMany({ data })])`.
  - Never `create` per tag in a loop; never leave the story tagless when the transaction fails.
- Publish state machine. These are the only legal transitions:

| From | Action | To | `publishedAt` | Chapter cascade | Cache invalidated |
| --- | --- | --- | --- | --- | --- |
| none | `createStory` | `DRAFT` | `null` | none | none needed, but story slug tags still cleared |
| `DRAFT` | `publishStory` | `PUBLISHED` | set to now only if currently `null` | none, chapters keep their own status | all |
| `PUBLISHED` | `unpublishStory` | `DRAFT` | preserved, never nulled | none | all |
| `PUBLISHED` | `archiveStory` | `ARCHIVED` | preserved | every `PUBLISHED` chapter of the story becomes `ARCHIVED`, same transaction | all |
| `ARCHIVED` | `restoreStory` | `DRAFT` | preserved | none; archived chapters stay archived | all |
| any | `deleteStory` | deleted | n/a | `Chapter` and `StoryTag` rows deleted by cascade in the same transaction | all |

- `restoreStory` must not auto-publish chapters. Republishing chapters is an explicit admin action.
- `setFeatured` requires `status = PUBLISHED`. Featuring a `DRAFT` or `ARCHIVED` story returns a typed error, because the featured rail is a public read.
- A story is publicly visible as soon as it is `PUBLISHED`. `publishStory` returns a warning field when it publishes a story with zero published chapters; it still succeeds, the story is listed and indexable, and the public detail page renders the "no published chapters yet" state.
- Cover lifecycle in `attachCover` and `removeCover`:
  - `attachCover` writes the new key in one transaction, then deletes the previous object after the transaction commits. Never delete the old object before the new key is durable.
  - `removeCover` sets `coverImage` to `null` in a transaction, then deletes the object.
  - `deleteStory` deletes the cover object after the row delete commits.
  - Object cleanup failures are logged with the project logger and retried by a sweep, never surfaced as an action failure and never left as a silent orphan.
- Admin list reads live in `src/lib/queries/admin-stories.ts` and do not filter by status. They clamp `page` and `pageSize` in the Zod schema, apply a fixed `orderBy` allowlist keyed by a literal union such as `'updatedAt' | 'title' | 'publishedAt'`, and never pass a caller-supplied string into `orderBy`. Sanitize `q` before it reaches the query.
- Cache invalidation runs after every successful mutation, outside the transaction: the story detail slug tag, the story list tags, the affected category and tag tags, and the sitemap tag. Use `revalidateTag` for query-level caches and `revalidatePath` for path-level ones.
- Public components never write `status: 'PUBLISHED'`. That filter lives only in `src/lib/queries/`.

## Security requirements

- Every action starts with `requireAdmin()` and a permission lookup for `story:write`, `story:publish`, `story:delete`, or `story:cover`, as appropriate. The layout guard is not a substitute.
- Resolve the target story by id inside the action, after the permission check. A bare id from a hidden field is untrusted input.
- Destructive actions require explicit confirmation: `deleteStory` requires a typed confirmation containing the story title, and the action re-checks that the supplied string matches the stored title before deleting.
- Never trust `featured`, `status`, or `publishedAt` from the form. The action derives the transition from the stored row and validates it against the matrix above.
- Bulk operations state exactly what will be removed. A bulk delete response includes the story and chapter counts.
- Log with the project logger and a request id. Never log `coverImage`, bucket names, `DATABASE_URL`, or full request bodies.
- Return safe messages only. Prisma error codes may be logged; they may not be returned to the client.

## Testing requirements

- Unit tests in `tests/unit/`:
  - `slugifyTitle` over diacritics, punctuation-only input, long titles, and empty input.
  - `uniqueSlug` collision suffixes.
  - `deriveExcerpt` whitespace collapse and word-boundary truncation.
  - The transition table, including the illegal `ARCHIVED -> PUBLISHED` direct jump and featuring a `DRAFT`.
- Integration tests in `tests/integration/story-actions.test.ts` against a real PostgreSQL test database:
  - Create, update, and delete with tag replacement, asserting `StoryTag` rows match exactly.
  - Publish a story with zero published chapters, then assert the public detail query hides it or returns the explicit empty state.
  - Unpublish and assert the story disappears from the public list, the sitemap query, and search.
  - Archive and assert chapters were cascaded and that restore does not republish them.
  - Delete and assert no orphaned `Chapter`, `StoryTag`, or cover object remains.
  - Concurrent slug generation on two identical titles, asserting one succeeds and the other returns a typed error or a suffixed slug.
- Authorization tests asserting a non-admin session and an expired session cannot invoke any story action.
- Playwright E2E: admin login, create draft, publish, verify public visibility, unpublish, verify removal.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Common mistakes

- Filtering by status in a page or component instead of inside `src/lib/queries/`.
- Passing a raw `orderBy` string from the admin list query params into Prisma.
- Nulling `publishedAt` on unpublish and destroying the original publish date.
- Deleting the old cover object before the new `coverImage` transaction commits, which loses the image on rollback.
- Auto-publishing chapters when a story is restored, which silently exposes archived drafts.
- Accepting a form-supplied `status` or `featured` value.
- Truncating the short description mid-word or storing HTML in `shortDescription`.
- Forgetting cache invalidation after a mutation, leaving a published story absent from the public list.
- Using a unique-violation retry loop that hides a real collision instead of surfacing a typed error.
- Forgetting that `Story_slug_key` is global, so an archived story still reserves its slug.

## Completion checklist

- [ ] All story mutations live in `src/actions/story.ts` and return `ActionResult`.
- [ ] Zod schemas in `src/lib/validation/story.ts` are `.strict()` and drive both the resolver and the action.
- [ ] Slugs are generated server-side, ASCII, unique, and retried on `P2002`.
- [ ] Published slug changes write a redirect or require explicit acknowledgement.
- [ ] Excerpts are server-derived plain text.
- [ ] Category and tag writes are verified and transactional.
- [ ] Every status transition matches the matrix; no path publishes a story without checking published chapters.
- [ ] Cover replace and remove delete orphaned objects after commit.
- [ ] Admin lists paginate and use a fixed `orderBy` allowlist.
- [ ] Cache invalidation runs on every successful mutation.
- [ ] Authorization is re-checked per action, and delete requires typed confirmation.
- [ ] No `console.log`, no leaked keys or bucket names, no raw Prisma messages returned.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
