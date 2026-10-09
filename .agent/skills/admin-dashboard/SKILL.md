# Skill: Admin Dashboard

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md sections 8 and 15 state the authorization and route-protection requirements. This skill covers the `/admin` surface: the four-layer contract at every entry point, the permission registry, navigation structure, the publish state machine, transactional reorder and bulk operations, pagination and table UX, destructive confirmation, statistics, and a preview that can never be mistaken for a public route.

## When to use

- Creating or changing any route under `src/app/admin/`, or anything in `src/components/admin/`.
- Adding a Server Action or Route Handler that mutates stories, chapters, categories, tags, or users.
- Changing status handling, publish or unpublish flows, chapter ordering, or tag and category replacement, and when building admin tables, filters, pagination, or confirmation dialogs.

## Relevant files

| Path | Responsibility |
| --- | --- |
| `src/app/admin/layout.tsx` | Layout guard: session, role, shell, navigation. Never the only check. |
| `src/lib/auth/guards.ts` | `requireSession`, `requireRole`, `requirePermission`, resource scoping. |
| `src/lib/auth/permissions.ts` | `Permission` capability registry and the role lookup. |
| `src/lib/content/status.ts` | Status helpers, transition matrix, `canTransition`. |
| `src/lib/queries/admin/stories.ts` | Admin story list and detail. May see `DRAFT` and `ARCHIVED`. |
| `src/lib/queries/admin/categories.ts`, `tags.ts` | Lists, usage counts, deletion blockers. |
| `src/lib/queries/admin/stats.ts` | Dashboard statistics and time-bucketed aggregates. |
| `src/actions/story.ts` | Create, update, delete, transitions, cover replace. |
| `src/actions/chapter.ts` | Create, update, delete, reorder, transitions. |
| `src/actions/category.ts`, `tag.ts` | Create, rename, bulk replace, delete with reference checks. |
| `src/components/admin/data-table.tsx` | Shared table: sorting, selection, pagination. |
| `src/components/admin/confirm-dialog.tsx` | Accessible confirmation, typed variant. |
| `src/components/admin/draft-banner.tsx` | Persistent status indicator on previews. |

## Implementation rules

**Four layers, applied in order at every entry point**

1. Authentication: a valid, unrevoked, unexpired session. Missing means redirect to `/admin/login` for navigations and a typed failure for actions.
2. Role: `requireRole(session.user.role, "ADMIN")` for every `/admin` surface.
3. Permission: `requirePermission("story.publish")`. The capability is named at the call site; the role comparison lives only in the registry.
4. Resource access: the row is fetched scoped to the operation, and the requested transition is legal.

- Layers 1 and 2 in the admin layout protect navigation. Every action and handler repeats layers 1 to 4 at call time, because an action is reachable by direct POST regardless of the layout.
- Actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }` with a stable `error.code` and a safe `message`; never throw across the boundary. Failures use generic codes, `unauthorized` for a missing or insufficient session and `forbidden` for role or permission, and never disclose whether the record exists.

**Permission registry**

- `src/lib/auth/permissions.ts` holds a frozen `PERMISSIONS` object mapping capability to roles, with capability names as string-literal types derived from the registry, never free strings.
- Call sites reference capabilities; no call site writes a role comparison, so finer roles become a data change rather than a rewrite.
- The lookup returns `false` for an unknown capability, so a typo fails closed through both the type system and the deny-by-default branch. Entries: `story.read`, `story.write`, `story.publish`, `story.delete`, `chapter.read`, `chapter.write`, `chapter.publish`, `chapter.delete`, `category.manage`, `tag.manage`, `user.manage`, `stats.read`.

**Navigation structure**

| Route | Screen | Capability |
| --- | --- | --- |
| `/admin` | Dashboard and statistics | `stats.read` |
| `/admin/stories` | Story list, filter by status and category | `story.read` |
| `/admin/stories/new` and `/admin/stories/[id]` | Story editor: metadata, cover, chapter list | `story.write` |
| `/admin/stories/[id]/chapters` | Chapter ordering | `chapter.write` |
| `/admin/stories/[id]/chapters/new` and `/[chapterId]` | Chapter editor with Tiptap | `chapter.write` |
| `/admin/stories/[id]/preview` | Draft preview | `story.read` |
| `/admin/categories` | Category management | `category.manage` |
| `/admin/tags` | Tag management | `tag.manage` |
| `/admin/users` | Admin users, activate or deactivate | `user.manage` |

- One navigation definition is the single source; items the current role cannot use are filtered by the registry, not per page. Active state comes from `usePathname`, the navigation landmark is named and keyboard operable, `robots.txt` disallows `/admin`, and admin pages set `robots: { index: false }`.

**Status transition matrix**

Anything not listed is refused with `invalid_transition`, and no write happens.

| From | To | Requires | Cascade |
| --- | --- | --- | --- |
| `DRAFT` | `PUBLISHED` | `story.publish`, one `PUBLISHED` chapter or explicit acknowledgement | Set `publishedAt` if null; revalidate story, category, list, sitemap |
| `DRAFT` | `ARCHIVED` | `story.write` | Leaves public surfaces; `publishedAt` retained |
| `DRAFT` | `DRAFT` | `story.write` | Metadata edit only; no revalidation |
| `PUBLISHED` | `DRAFT` | `story.publish` | Removed from public surfaces; `publishedAt` retained |
| `PUBLISHED` | `PUBLISHED` | `story.write` | Metadata edit; revalidate |
| `PUBLISHED` | `ARCHIVED` | `story.publish` | Removed from public and from recommendations |
| `ARCHIVED` | `PUBLISHED` | `story.publish`, one `PUBLISHED` chapter | Restore; revalidate |
| `ARCHIVED` | `DRAFT` | `story.write` | Remains public-invisible |
| `ARCHIVED` | `ARCHIVED` | `story.write` | No-op |
| editor field | any `status` | none | Rejected; `status` is omitted from the Zod schema |

- Chapter transitions mirror this table with `chapter.publish`, scoped to one `storyId`. A chapter cannot be published while its story is `DRAFT` or `ARCHIVED`; publishing a story never publishes its chapters, and publishing a chapter never publishes the story.
- The transition check runs inside the same transaction as the write, never check then write, and every publish or unpublish revalidates the story slug, the owning category, the list pages, and the sitemap. An admin change invisible to readers is a bug.

**Reorder and bulk operations**

- Reorder runs in one `prisma.$transaction`. Because `("storyId", "chapterNumber")` is unique, a naive swap violates the constraint: shift every chapter of the story by a large offset first, then write the final values, all inside the transaction.
- Validate the submitted permutation server-side: same count as stored, no duplicate ids, every id belongs to the story in the route. One unknown id aborts the whole transaction, and `chapterNumber` must end dense and 1-based.
- Tag replacement for a story is `deleteMany` then `createMany` in one transaction, never a loop of upserts. Bulk publish or unpublish runs `updateMany` in a transaction and reports the count the query returned, never a client-supplied number.

**Deletion and confirmation**

- Every destructive action needs a confirmation step plus a server-side re-check. One story: the dialog names the story and its chapter count and requires the slug to be typed. One chapter: a named confirmation dialog stating the title and position.
- Bulk destructive: the dialog lists the exact records and the exact total that will be deleted, generated server-side from current data. The confirm control stays disabled until the typed value matches and the server verifies it again; client matching is UX only.
- Deletion is transactional across story, chapters, and `StoryTag` rows, then the cover object is removed after commit. The server recomputes the affected set on submit, so a stale or forged selection cannot widen scope.

**Pagination and table UX**

- Every list is paginated. Default 20 rows, maximum 100, `page` clamped to a positive integer, with offset pagination (`skip`/`take`) plus a total count and page numbers. Fetch the page and the count concurrently, never `findMany` without `take`.
- Sorting is a server-side whitelist whose unmapped keys fall back to the default, never interpolated into an order clause.
- Admin tables use the shared `data-table` component, with selection keyed by record id so it survives pagination, and row actions as real `<Form action={serverAction}>` submissions; destructive rows still go through the dialog.
- Tables have an accessible name, a scoped `<th>` per column, and a labelled pagination region. Empty, loading, and error states are explicit and shared, and a failed mutation keeps the admin's typed input.

**Statistics**

- Aggregate counts only: totals by status, published per period, chapters per story, category and tag usage. Prefer `count` and `groupBy`, using `$queryRaw` with tagged templates only where a date bucket is genuinely needed.
- All reads go through `src/lib/queries/admin/stats.ts` behind `stats.read`, and never fetch a full table to aggregate in JavaScript. Show real limits: an empty admin shows zeros, not a broken panel.

**Preview, distinct from public routes**

- Preview lives at `/admin/stories/[id]/preview` inside the admin layout; a draft is never served at a public URL. A persistent, non-dismissible `draft-banner` states the status, that this is a preview, and that readers cannot see it, announced to assistive technology.
- Preview sets `robots: { index: false, follow: false }`, emits no canonical URL, no `Story` or `Article` JSON-LD, and never enters the sitemap.
- Preview reuses the shared renderer through a distinct wrapper and never the public page's metadata generation. Every control on the path is admin-scoped, and a draft is never editable from a public route.

## Security requirements

- Layers 1 to 4 at call time in every action and handler. The layout guard is navigation convenience, not authorization.
- Default deny on an unknown capability, a missing policy entry, or a failed resource scope.
- Roles come from the database via the session, never from a form field, hidden input, URL parameter, or client state. No bare id is accepted for a mutation without a role check and a scoped fetch.
- Input is parsed by the domain Zod schema in `src/lib/validation/` before any database call, with unknown keys stripped.
- Chapter rich text is sanitized server-side on write, including from admins. Cover uploads go through `src/lib/storage/` with the format allowlist, size ceiling, magic-byte check, and re-encode, and replacing a cover deletes the old object.
- Destructive and bulk actions state exactly what will be deleted and re-check on the server; reorder and bulk writes are transactional, so failure leaves no partial or duplicate `chapterNumber`.
- Admin responses never include password hashes, session tokens, or raw storage keys. Admin segments sit behind a React error boundary, and there is no `console.log`; use the logger with a request id.

## Testing requirements

Unit (Vitest):

- The registry resolves every capability for its intended role and denies an unknown capability, and `canTransition` accepts every listed pair while rejecting every unlisted pair, for story and chapter.
- Reorder and bulk tag validation reject duplicates, wrong counts, and foreign ids; confirmation payloads reject a mismatched typed value; pagination clamps out-of-range and non-numeric pages; sort keys outside the whitelist fall back.

Integration (real PostgreSQL):

- Every action and handler rejects an unauthenticated call and a session lacking the capability, and every illegal transition is refused with the row unchanged.
- Publishing a story with no published chapters succeeds with the normal notice; the story is still publicly visible, and the detail page omits the chapter list and start action with no chapter-related notice. Publish, verify public visibility, unpublish, verify removal everywhere including the sitemap, and verify revalidation ran.
- Reorder succeeds under the unique constraint and leaves a dense sequence, while a failing transaction leaves the original order intact.
- Bulk publish touches exactly the selected records and returns the real count; bulk tag replacement leaves no orphaned `StoryTag` rows; story deletion removes chapters, join rows, and the cover object.
- Category and tag deletion is refused while referenced and names the blockers; statistics counts match seeded fixtures, including drafts and archived rows.

E2E (Playwright):

- Login, dashboard, create draft, absent from the public site, publish, visible, unpublish, removed.
- Create a story, add two chapters, reorder, and confirm the public order matches; bulk delete shows the exact record count then deletes; a non-admin session attempting an admin mutation gets 403 with no mutation.

## Common mistakes

- Relying on the admin layout guard as the only check, or writing a role comparison in a component or action instead of using the registry.
- A permission lookup that returns `true` for an unrecognized capability.
- Reordering chapters sequentially, which violates `("storyId", "chapterNumber")`, leaving gaps or a half-applied swap, or swapping with no transaction.
- Editing `status` as a form field, or deleting a story without its cover object.
- Publishing a chapter on an archived story and leaking content, or a draft cover served publicly.
- Forgetting to revalidate, so admin and public disagree. Tag replacement as upsert loops, leaving orphaned join rows.
- An unbounded admin list, an N+1 chapter count per row, or a client sort field interpolated into `orderBy`.
- A stale selection widening a bulk delete beyond what the admin saw.
- Treating preview as public: no robots directive, no banner, JSON-LD emitted. Leaking draft titles or counts into public metadata.

## Completion checklist

- [ ] Layers 1 to 4 enforced at call time everywhere, plus the layout guard.
- [ ] Permissions from the registry; unknown capabilities deny; navigation capability-filtered from one definition.
- [ ] Status changes only via dedicated actions, in a transaction, after `canTransition`, with illegal transitions refused and tested.
- [ ] Publish and unpublish revalidate story, category, lists, and sitemap.
- [ ] Reorder transactional and dense 1-based with a validated permutation; bulk writes transactional.
- [ ] Destructive and bulk flows state exactly what will be deleted and re-check server-side.
- [ ] Every list paginated and sorted through a server-side whitelist, using the shared table.
- [ ] Statistics from `stats.read`-gated aggregates, never full-table aggregation.
- [ ] Preview under `/admin` with a persistent banner, `noindex`, no canonical, no JSON-LD.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.