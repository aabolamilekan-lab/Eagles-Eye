# Skill: Database

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md sections 5, 6, and 14 define the data contract. This skill supplies the detail AGENTS.md leaves open: which index backs which query, where a `status` filter may appear, explicit `select` shapes, transaction boundaries, cache tags, and seed safety.

## When to use

- Editing `prisma/schema.prisma`, writing a migration, or changing a field, relation, or index.
- Adding or changing any function in `src/lib/queries/`, or writing a `findUnique`, `findMany`, `update`, or `delete` anywhere else.
- Any Server Action that performs more than one write, or that reorders chapters.
- Changing public list, detail, search, category, tag, or sitemap reads.
- Touching `src/lib/db.ts`, `prisma/seed.ts`, or a `revalidateTag` / `revalidatePath` call.

## Relevant files

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Single source of truth for the data model. |
| `prisma/migrations/` | Committed SQL. Never hand-edited once applied anywhere. |
| `prisma/seed.ts` | Local-only fixtures. Refuses a production or non-local database. |
| `src/lib/db.ts` | Prisma client singleton, one instance per process. |
| `src/lib/queries/stories.ts` | Public list, detail, featured, related. Status filter sealed here. |
| `src/lib/queries/chapters.ts` | Published chapter lists and sibling navigation. |
| `src/lib/queries/taxonomy.ts` | Categories and tags for public filters. |
| `src/lib/queries/search.ts` | Sanitized search over published stories. |
| `src/lib/queries/admin.ts` | Authenticated-only reads that may see `DRAFT` and `ARCHIVED`. |
| `src/lib/queries/stats.ts` | Admin dashboard aggregates. |
| `src/actions/stories/*` | Status transitions, cover replacement, tag replacement, delete. |
| `src/actions/chapters/*` | Create, edit, delete, reorder. |
| `src/lib/cache.ts` | Public cache tag constants and the invalidation helper. |
| `src/lib/validation/story.ts`, `chapter.ts` | Zod shapes written straight into Prisma `data`. |

## Implementation rules

**Client singleton**

- `src/lib/db.ts` exports one `PrismaClient`, parked on `globalThis` in development so hot
  reload cannot exhaust the connection pool. One instance; never per-module instances.
- `DATABASE_URL` is read from the Zod-validated env module, never from `process.env` at a
  call site.
- Transaction clients are function arguments typed `Prisma.TransactionClient`. Never a
  request-scoped client reaching a component.

**Schema changes**

- Generate with `npx prisma migrate dev --name <change>`. Commit the SQL in `prisma/migrations/` in the same commit as the code that depends on it. Production applies with `npx prisma migrate deploy`; `migrate dev` never touches production.
- Never edit an already-applied migration. Add a forward migration.
- Every relation declares `fields` and `references`. `StoryTag` is explicit: composite primary key `("storyId", "tagId")` with two foreign keys, no implicit many-to-many.
- Delete behaviour is decided per relation: `onDelete: Cascade` from `Story` to `Chapter`, `StoryTag`, and `StoryView`, and from `User` to `Session`; `onDelete: SetNull` from `StoryView.chapterId` to `Chapter` so analytics survive a chapter removal; `onDelete: Restrict` from `Story.categoryId` to `Category` so a category cannot be dropped while stories reference it.

**Status handling**

- `ContentStatus` is a Prisma enum. TypeScript uses the generated type. Never a hand-written
  union, never a loose `string`.
- Transitions are explicit and legal: `DRAFT -> PUBLISHED`, `PUBLISHED -> DRAFT`,
  any -> `ARCHIVED`. `ARCHIVED -> PUBLISHED` needs a deliberate restore path in the action,
  never a generic status field write.
- `publishedAt` is set on publish and cleared on unpublish. A stale `publishedAt` on a
  non-published story is a defect.
- Status changes go through named transition helpers so the legal set lives in one file.

**Index coverage**

| Field or tuple | Backs |
| --- | --- |
| `Story.status` + `Story.publishedAt` (composite, `publishedAt` desc) | Public ordering, sitemap |
| `Story.featured` | Featured list filter |
| `Story.slug` unique | Public story detail lookup |
| `Story.categoryId` | Category page filter |
| `StoryTag.tagId` | Tag page filter and tag reassignment |
| `Chapter.status` | Published-chapter existence check |
| `("storyId", "chapterNumber")` unique | Chapter ordering, sibling navigation, reorder |
| `("storyId", "slug")` unique | Chapter page lookup under a story |
| `("storyId", "status")` | Published-chapter existence check per story |
| `StoryView("storyId", "viewedAt")` | View analytics per story over time |
| `StoryView.chapterId`, `StoryView.sessionId` | Per-chapter counts, distinct-session counting |
| `Session.tokenHash` unique | Session lookup on every authenticated request |
| `Session.expiresAt` | Expired-session sweep |
| `LoginAttempt("identifier", "attemptedAt")` | Lockout window query |
| `Category.slug`, `Tag.slug` unique | Taxonomy page lookup |

- A new filter, sort, or lookup on an unindexed column ships with its index in the same
  migration as the query that needs it.

**Public query layer**

- Every public read is a named function in `src/lib/queries/`. Pages, Server Components, `sitemap.ts`, and Route Handlers call those functions and never call Prisma directly.
- `status: PUBLISHED` is applied inside the query function. The literal must not appear in a page, component, or action.
- A public story detail function must prove at least one published chapter exists before returning. Return the story with an empty chapter list and let the page render the "no published chapters yet" state.
- Sibling navigation selects only `PUBLISHED` chapters, so next and previous never point at a draft. `src/lib/queries/admin.ts` is the only module allowed to omit the status filter, and nothing under `src/app/(public)/` may import it.
- Admin previews are structurally distinct: separate query names, separate components, and a visible draft banner.

**Explicit column selection**

- Every `findUnique`, `findMany`, and `include` uses `select`. The default full-row shape is never relied upon.
- `User` selections exclude `passwordHash` except in the single authentication query, which binds the hash to a local variable and never spreads the row into a response, log line, or cache value.
- `Session` selections exclude `tokenHash`. Only `src/lib/auth/session.ts` reads it, only for an indexed equality lookup.
- `create` and `update` use explicit `data` objects assembled field by field from a parsed Zod result. Never `data: input`, which forwards unknown keys. Cache values are the projected shape, never the row.

**Pagination**

- Every list takes a validated, clamped page size: `z.coerce.number().int().min(1).max(50)`, default 12 or 20. Paginate with `skip` / `take` plus `orderBy` on a stable indexed column, breaking ties on `id` so page 2 never repeats or drops a row.
- A `findMany` without `take` is a defect, including in admin tables. The pagination total and the page query share one filter object, built once.

**Transactions**

- `prisma.$transaction` covers: chapter reorder; story publish and unpublish (row plus `publishedAt` plus tags); tag and category replacement (`deleteMany` then `createMany`); story deletion with its chapters, tags, and cover; and bulk session invalidation.
- Chapter reorder, inside one transaction: read the ordered ids, shift affected rows by a sentinel offset so the `("storyId", "chapterNumber")` unique constraint cannot collide mid-flight, then write final values with `updateMany`. Sequential writes outside a transaction are never correct here.
- Cover replacement writes the new `coverImage` and deletes the previous object; if the write fails, delete the newly uploaded object rather than orphan it. Keep transactions short: no outbound HTTP, no S3 call, no user-visible waiting inside the callback.

**Cache and invalidation**

- Public reads are tagged in `src/lib/cache.ts`: `stories:list`, `stories:detail:<slug>`, `chapters:<storySlug>`, `taxonomy`. Prefer tags over path keys when several routes share data.
- Invalidate on every write that changes published output: publish, unpublish, archive, chapter content or status edits, reorder, delete, cover replacement, category or tag rename or reassignment. A write action that changes published output without an invalidation call is incomplete.
- `sitemap.ts` and any feed read through the same cached public functions, never a private entry. Admin lists are not cached: draft state must never be stale in the editor about to publish it.

**Seed safety**

- `prisma/seed.ts` refuses to run when `NODE_ENV === "production"`, when `DATABASE_URL` is absent, or when the host is not localhost or a recognised local container host. It checks before any write and exits non-zero with the reason.
- The current seed is content only: categories, tags, fictional stories and chapters, and anonymous view rows. It creates no `User` and holds no credential. When the authentication phase lands, the admin fixture is created from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` with a documented local-only default.
- Fixtures upsert on `slug` or `email` so re-running is idempotent. Tests seed their own database; the shared dev seed is not a test fixture.
- No real credentials, no real names, no third-party text. Fixtures are labelled development data.

## Security requirements

- PostgreSQL is never reachable from a browser. No connection string in a Client Component, no direct SQL endpoint, no Prisma import in a `"use client"` module.
- `$queryRawUnsafe` with interpolation is forbidden. `$queryRaw` uses tagged templates so values stay bound parameters. A literal identifier is mapped through a closed allowlist first.
- No unscoped user-supplied filters. Sort keys resolve through an allowlist map to a fixed set of indexed columns; they never reach `orderBy` raw.
- Every admin mutation re-verifies authorization in the action, before the transaction opens. A layout guard does not authorize a direct action invocation.
- `passwordHash`, `tokenHash`, raw session tokens, and connection strings appear in no log line, error message, or cache entry.
- `deleteMany` filters are built in code from validated input, never from a raw body field. A bulk delete states its blast radius in the confirmation UI.
- Prisma error codes (`P2002`, `P2025`, `P2003`) are mapped to safe text at the boundary. The code may be logged; the message never returns. Storage keys and bucket names must not appear in a public payload or an error string.

## Testing requirements

- Unit: slug generation and suffix logic, status-transition legality, pagination clamping, sort-allowlist resolution.
- Integration against a real PostgreSQL test database for every function in `src/lib/queries/`: a `DRAFT` or `ARCHIVED` story is absent from list, detail, search, category, tag, and sitemap results, and a `DRAFT` chapter is absent from sibling navigation.
- Integration: the `("storyId", "chapterNumber")` constraint rejects a duplicate chapter number; a failed reorder leaves chapter order unchanged.
- Integration: a publish transaction forced to fail midway leaves story status, `publishedAt`, and tags unchanged.
- Integration: cache invalidation asserted through behaviour, not internals. Publish, then read the public detail function and observe the new content.
- Integration: an admin query and a public query for the same slug return different shapes, proving the status filter is sealed inside the query layer.
- No Prisma mocks. Assertions read real rows created by the test's own seed, and no assertion payload contains `passwordHash` or `tokenHash`.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Page or component calls `prisma.story.findMany` directly | Add or extend a function in `src/lib/queries/` and call that |
| Public page writes `status: "PUBLISHED"` itself | Filter inside the query; the literal stays out of components and pages |
| `admin.ts` query imported by a `(public)` route | Split the query; the public layer has no escape hatch |
| `findMany` with no `select` | Project explicit columns; `include` of a large relation is also an N+1 trap |
| Client-supplied string passed to `orderBy` | Resolve through an allowlist map to fixed indexed columns |
| `findMany` with no `take` | Add validated pagination with a stable tie-breaker |
| Chapter `chapterNumber` written row by row outside a transaction | Wrap in `$transaction`; offset rows first to dodge the unique constraint |
| `data: parsedInput` forwarded straight to Prisma | Build the `data` object field by field |
| Seed run against a hosted database | Refuse non-local hosts and `NODE_ENV=production` before any write |
| Hand-editing an applied migration | Create a new forward migration |
| Cache invalidated on the read path only | Invalidate inside the admin write action before returning |
| Dropping an index as "redundant" | Re-check query plans; every filter, sort, and lookup field is indexed |

## Completion checklist

- [ ] Migration generated with `npx prisma migrate dev --name <change>`, SQL committed.
- [ ] New filters, sorts, and lookups have an index.
- [ ] Every public read goes through `src/lib/queries/`; no status literal in a page or component.
- [ ] Public story detail proves a published chapter exists.
- [ ] Sibling navigation returns published chapters only.
- [ ] Every query uses `select`; `passwordHash` and `tokenHash` reach no payload, log, or cache.
- [ ] Every list is paginated with a clamped page size and a stable order.
- [ ] Every multi-write path is inside `$transaction`.
- [ ] Public cache tags are invalidated by every write action that changes published output.
- [ ] Seed refuses production and non-local databases and holds no real credentials.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.