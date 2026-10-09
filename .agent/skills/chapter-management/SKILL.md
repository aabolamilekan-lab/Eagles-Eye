# Skill: Chapter Management

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

- Own the lifecycle of the `Chapter` row: create, edit, delete, reorder, and per-chapter publish state.
- Keep `chapterNumber` gap-free and correct under the unique constraint on `("storyId", "chapterNumber")`, without races.
- Treat the Tiptap editor as a client convenience and the server sanitizer as the sole authority on stored HTML.
- Make chapter navigation correct for readers: published siblings only, ordered, no dead ends.

## When to use

- Creating, editing, deleting, or duplicating a chapter.
- Reordering chapters within a story, including drag-and-drop in admin.
- Publishing or unpublishing a single chapter.
- Integrating or changing the Tiptap editor, its toolbar, autosave, or save state.
- Changing how chapters are numbered or labelled in admin and on the reader page.
- Changing previous / next navigation or the end-of-story state.

## Relevant files

| Path | Role |
| --- | --- |
| `src/actions/chapter.ts` | All chapter Server Actions, typed results |
| `src/lib/validation/chapter.ts` | Zod schemas: create, edit, reorder payload |
| `src/lib/queries/chapters.ts` | Public chapter reads, `status = PUBLISHED` internal |
| `src/lib/queries/admin-chapters.ts` | Admin reads, all statuses, ordered by `chapterNumber` |
| `src/lib/sanitize/rich-text.ts` | `sanitizeRichText` allowlist sanitizer |
| `src/lib/excerpt.ts` | `htmlToPlainText` for the stored plain-text short description |
| `src/lib/slug.ts` | `slugifyTitle` and `uniqueChapterSlug(storyId, base)` |
| `src/components/admin/chapter-editor.tsx` | Tiptap client component, submit only |
| `src/components/admin/chapter-list.tsx` | Reorderable admin list |
| `src/components/public/rich-text.tsx` | The only place `dangerouslySetInnerHTML` is allowed |
| `src/components/public/chapter-nav.tsx` | Previous / next / index navigation |
| `src/app/admin/stories/[id]/chapters/page.tsx` | Admin chapter screen |
| `tests/unit/chapter-order.test.ts` | Reorder and numbering logic |
| `tests/integration/chapter-actions.test.ts` | Actions against the test database |

## Implementation rules

- Actions in `src/actions/chapter.ts`, one per mutation: `createChapter`, `updateChapter`, `deleteChapter`, `reorderChapters`, `publishChapter`, `unpublishChapter`, `archiveChapter`. Each returns `ActionResult<T>` and never throws a Prisma error outward.
- Validation lives in `src/lib/validation/chapter.ts` and is `.strict()`. Types come from `z.infer<typeof createChapterSchema>`.
- Append semantics: `createChapter` sets `chapterNumber = max(chapterNumber) + 1` for that `storyId` inside the transaction. On a `P2002` collision from a concurrent append, recompute and retry once, then return a typed error. Never leave two chapters at the same `chapterNumber`.
- `status` is always `DRAFT` on create. Creating a published chapter is not offered by the action surface, because it would bypass the reader's view of an unfinished story.
- Slug uniqueness is scoped per story, not global. `uniqueChapterSlug(storyId, base)` checks `prisma.chapter.findFirst({ where: { storyId, slug } })` and appends `-2`, `-3`, and so on. Two stories may each have a chapter at `chapter-1`.
- Reordering under `("storyId", "chapterNumber")` uniqueness. An in-place swap violates the constraint, so reorder is a two-phase write inside one interactive transaction:
  1. Shift every chapter of the story into a temporary, non-colliding band, for example `order: { increment: 100000 }`, so existing values cannot clash with their targets.
  2. Write the final contiguous values `1..n` from the validated payload.
  3. Run the whole thing in `prisma.$transaction(async (tx) => { ... }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })` so two concurrent reorders of the same story cannot interleave.
  4. On a `P2002` or serialization failure, retry the transaction at most once, then return a typed error telling the admin the list changed and to reload.
- The reorder payload is a full ordered list of chapter ids for that story. Validate that the id set exactly equals the stored id set for the story; a partial or mismatched list is a typed error, never a silent partial reorder.
- Delete and compaction happen together. `deleteChapter` deletes the row and renumbers the remaining chapters to `1..n` in the same transaction. Gaps in `chapterNumber` are never left behind.
- Deleting the last remaining chapter of a published story is allowed and succeeds with the normal `deleted` notice. The public detail page then omits the chapter list and the start action, with no chapter-related notice.
- Rich text pipeline:
  - Tiptap runs client side only and its output is untrusted input. `chapter-editor.tsx` submits raw HTML as a string field.
  - The action calls `sanitizeRichText` from `src/lib/sanitize/rich-text.ts` before any write, and stores only the sanitized HTML in `content`. Never store what the editor sent.
  - Client-side sanitization, if any, is a UX affordance and never the control.
  - Rendering goes through `src/components/public/rich-text.tsx` only. That is the single sanctioned `dangerouslySetInnerHTML` call site.
- Plain-text short description: derive server side from the sanitized HTML, not from the submitted string. `htmlToPlainText(sanitized)` strips tags, decodes entities, collapses whitespace, and truncates at a word boundary. Use it for metadata descriptions, search indexing, and list previews.
- `publishChapter` requires that the sanitized plain-text body is non-empty. Publishing an empty chapter returns a typed field error on `content`.
- Per-chapter transitions, and their effect on the parent story:

| From | Action | To | `publishedAt` | Reader visibility | Story-level effect |
| --- | --- | --- | --- | --- | --- |
| `DRAFT` | `publishChapter` | `PUBLISHED` | set to now if `null` | appears in chapter list and nav | makes the story readable (the story is already publicly visible once published) |
| `PUBLISHED` | `unpublishChapter` | `DRAFT` | preserved, never nulled | disappears from list and nav | story stays listed but is no longer readable if it was the only published chapter |
| `PUBLISHED` | `archiveChapter` | `ARCHIVED` | preserved | gone | none |
| `ARCHIVED` | `publishChapter` | `PUBLISHED` | set to now | appears again | none |
| `DRAFT` | `archiveChapter` | `ARCHIVED` | `null` | never was visible | none |
| any | `deleteChapter` | deleted | n/a | gone | remaining chapters renumbered in the same transaction |

- Direct `ARCHIVED -> DRAFT` is not an action. Restore an archived chapter through `publishChapter` or leave it archived.
- Next / previous semantics, resolved server side in `src/lib/queries/chapters.ts`:
  - "Previous" is the `PUBLISHED` chapter with the greatest `chapterNumber` strictly less than the current chapter's `chapterNumber`.
  - "Next" is the `PUBLISHED` chapter with the smallest `chapterNumber` strictly greater than the current one.
  - Siblings are filtered to `PUBLISHED` inside the query layer. The component receives booleans or `null`, never a query it could widen.
  - No wrap-around. When there is no next chapter, render an explicit end-of-story state with a link back to the story detail page.
- Numbering presentation:
  - Admin lists show the stored `chapterNumber`, which is contiguous and is the real sequence.
  - Reader-facing labels use the index within the published set, so unpublishing an early chapter does not renumber a published story in the reader's view.
  - Both numbers are computed server side. The client never recounts a list to label a chapter.
- Cache invalidation after every successful chapter mutation: the story detail tag, the chapter-list tag, the sibling navigation tag, and the sitemap tag. Invalidating only the chapter tag leaves stale navigation.

## Security requirements

- Every action calls `requireAdmin()` and a `chapter:write` or `chapter:publish` permission lookup before touching the database.
- Load the parent story by `storyId` from the action, not from the form. A chapter id alone must never be sufficient to authorise a mutation, and the chapter must belong to the story being edited.
- Reordering is destructive in effect: it rewrites the sequence of a live story. Require explicit confirmation on the client and re-check authorization at call time.
- `content` is sanitized server side on every write, including on edit of an already published chapter. Publishing does not re-exempt content.
- Never render `content` outside `src/components/public/rich-text.tsx`. Admin previews of drafts must use a structurally distinct component and a visibly labelled draft badge.
- Strip `javascript:`, `data:`, and `vbscript:` hrefs, all `on*` handlers, and any attribute not on the allowlist. See AGENTS.md section 10 for the full stripped list; the sanitizer implements it, not the call site.
- Add `rel="noopener noreferrer"` to every external link the sanitizer keeps.
- Rate-limit autosave-driven update actions, and reject suspiciously large `content` payloads with a hard byte ceiling before sanitization.
- Never log chapter content, session tokens, or full request bodies. Log ids, order values, and counts.

## Testing requirements

- Unit tests in `tests/unit/`:
  - `htmlToPlainText` over nested tags, entities, script-looking text, and whitespace runs.
  - Excerpt truncation at word boundaries, including content shorter than the limit.
  - `uniqueChapterSlug` producing per-story duplicates without global collisions.
  - The reorder planner, asserting the temporary band cannot collide with target values.
  - `publishChapter` rejecting empty sanitized content.
- Integration tests in `tests/integration/chapter-actions.test.ts` against a real PostgreSQL test database:
  - Create three chapters, assert `chapterNumber` is `1, 2, 3`.
  - Reorder to `3, 1, 2` and assert stored values match with no gap and no duplicate.
  - Attempt a reorder payload missing an id, and assert a typed error and unchanged data.
  - Run two concurrent reorders of the same story and assert final `chapterNumber` values are contiguous and unique.
  - Delete the middle chapter and assert the remaining `chapterNumber` is renumbered contiguously in the same transaction.
  - Publish one chapter of a draft story and assert the public story detail query now returns it; unpublish and assert it returns an empty chapter list with no start action again.
  - Store `<script>alert(1)</script>` and an `onerror` attribute in `content`, then assert neither survives in the stored row.
  - Assert a `DRAFT` chapter never appears in the public chapter list, nav, or sitemap query.
- Authorization tests: a non-admin session, and an IDOR attempt passing another story's chapter id with a valid session, must both fail.
- Playwright E2E: read chapter 1, follow next to chapter 2, follow previous back, and reach the end-of-story state.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Common mistakes

- Swapping `chapterNumber` values directly in a loop, which trips `Chapter_storyId_chapterNumber_key` mid-write.
- Reordering outside a serializable transaction, so two admins reorder the same story and one silently loses.
- Persisting the Tiptap HTML verbatim because the editor "looks clean".
- Using `dangerouslySetInnerHTML` in an admin preview or a page instead of the single shared component.
- Deriving the plain-text short description from the submitted HTML instead of the sanitized output.
- Nulling `publishedAt` when unpublishing and losing the original publication date.
- Renumbering the reader's view by stored `chapterNumber`, which jumps labels after an unpublish.
- Leaving `chapterNumber` gaps after a delete, so appending later produces a non-contiguous sequence.
- Wrapping navigation from the last chapter back to the first.
- Allowing a chapter slug to collide globally instead of scoping uniqueness to `storyId`.
- Invalidating only the chapter cache tag and leaving stale next / previous links on public pages.

## Completion checklist

- [ ] All chapter mutations live in `src/actions/chapter.ts` and return `ActionResult`.
- [ ] `chapterNumber` is contiguous, and reorder runs two-phase inside a serializable transaction.
- [ ] Reorder payloads are validated against the full stored id set for the story.
- [ ] Delete and renumber share one transaction; no gaps remain.
- [ ] Chapter slug uniqueness is scoped per `storyId`.
- [ ] `content` is sanitized server side on every write, including edits to published chapters.
- [ ] The stored plain-text short description is derived from the sanitized HTML.
- [ ] Publishing an empty chapter is rejected.
- [ ] Previous / next are resolved server side over `PUBLISHED` siblings only, with an explicit end state.
- [ ] Admin numbering and reader numbering follow the rules above.
- [ ] Cache invalidation covers story detail, chapter list, navigation, and sitemap.
- [ ] Authorization is re-checked per action with the parent story loaded server side.
- [ ] No `console.log`, no logged chapter content.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
