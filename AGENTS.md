# AGENTS.md

Global source of truth for the Eagles Eye story publishing and reading platform.

This file governs the entire project. Read it before modifying anything. If a change
contradicts this document, the change is wrong.

---

## 1. Project Summary

Eagles Eye is a full-stack story publishing and reading platform.

**Public visitors can:**

- Browse stories
- Search stories
- Filter stories by category
- View story details
- Read published chapters
- Navigate between chapters (previous / next / by index)
- Discover featured and recently published stories

**Administrators can:**

- Securely log in
- Manage stories (create, edit, delete)
- Upload story covers
- Create, edit, delete and reorder chapters
- Save drafts
- Publish and unpublish stories
- Publish and unpublish chapters
- Manage categories
- Manage tags
- View basic statistics
- Manage the publishing workflow

### Non-goals

- Multi-tenant accounts or reader profiles
- Comments, ratings, or social features
- Payments or subscriptions
- Real-time collaboration

Do not build these unless the requirement changes.

---

## 2. Technology Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router) |
| UI | React |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Server-side sessions, HttpOnly cookies |
| Validation | Zod |
| Forms | React Hook Form (with Zod resolvers) |
| Rich text | Tiptap, sanitized server-side |
| Icons | Lucide React |
| Storage | S3-compatible object storage, private by default |
| Mutations | Next.js Server Actions and/or Route Handlers |
| Tests | Vitest (unit) + Playwright (E2E) |

### Dependency policy

- Every new dependency must earn its place. Prefer platform and library APIs already in the stack.
- No heavyweight utility libraries (`lodash`, `moment`, `axios`, …) for one-line needs.
- Never mix two libraries that solve the same problem.
- Before adding anything, check whether the codebase already has a pattern for it.
- Run `npm audit` before finishing a phase that adds dependencies. Report anything high or critical.

---

## 3. Project Layout

```
.
├── AGENTS.md                  # this file
├── .env.example               # documented env contract, never real values
├── prisma/
│   ├── schema.prisma          # data model, single source of truth
│   ├── migrations/            # committed SQL migrations
│   └── seed.ts                # development seed, no real credentials
├── public/                    # static assets only
├── src/
│   ├── app/
│   │   ├── (public)/          # public routes: /, /stories, /categories, search
│   │   ├── admin/login/       # sign-in, outside the guarded group
│   │   ├── admin/(dashboard)/ # protected admin routes, server-guarded
│   │   ├── api/               # Route Handlers only where needed
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── components/
│   │   ├── ui/                # design-system primitives
│   │   ├── layout/            # page chrome (SiteChrome)
│   │   ├── navigation/        # header, footer, wordmark, breadcrumbs
│   │   ├── stories/           # story/category cards and grids
│   │   ├── chapters/          # reading layout, chapter nav/list, rich text
│   │   ├── search/            # search bar and result rows
│   │   └── admin/             # admin shell, forms, editors
│   ├── lib/
│   │   ├── auth/              # session, password hashing, guards
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── validation/        # Zod schemas, one per input surface
│   │   ├── sanitize/          # rich-text sanitization
│   │   ├── storage/           # upload handling
│   │   ├── rate-limit/        # security-sensitive rate limits
│   │   └── queries/           # shared data access functions
│   ├── actions/               # Server Actions grouped by domain
│   └── types/
├── tests/
│   ├── unit/
│   └── e2e/
└── .agent/skills/             # specialized skill instructions
    └── <skill>/SKILL.md
```

**Layout rules**

- Route groups `(public)` and `admin/(dashboard)` do not affect URLs. Admin lives at
  `/admin`; `admin/login` sits outside the guarded group so it cannot redirect to itself.
- Business logic goes in `src/lib` or `src/actions`, never in page or component bodies.
- Pages fetch and compose. They do not contain business rules.
- No barrel file re-exports of everything. Import concrete modules.

---

## 4. Global Rules

These rules are non-negotiable and apply to every change.

1. Always read `AGENTS.md` before modifying the project.
2. Always read the relevant `.agent/skills/SKILL.md` file before specialized work.
3. Inspect existing code before changing it.
4. Preserve existing working functionality.
5. Do not rewrite unrelated functionality.
6. Do not create fake functionality. No placeholder features that pretend to work.
7. Do not use hardcoded application data where database data is required.
8. Do not hardcode secrets.
9. Do not expose private environment variables to the client.
10. Use strict TypeScript. No `any`. No non-null assertions without a proven invariant.
11. Validate all external input at the server boundary.
12. Use server-side authorization.
13. Never trust client-side authorization.
14. Never trust user-submitted roles or permissions.
15. Sanitize rich-text content.
16. Secure all file uploads.
17. Protect database operations (no unscoped user-supplied filters).
18. Use Prisma safely (parameterized by default; no `$queryRawUnsafe` with interpolation).
19. Use database transactions when multi-write consistency is required.
20. Handle errors safely.
21. Do not expose internal errors to users. Log server-side, return safe messages.
22. Use secure sessions.
23. Use secure cookies.
24. Rate-limit security-sensitive operations.
25. Protect admin routes server-side.
26. Public users must only see published content.
27. Draft and archived content must never appear publicly.
28. Do not expose sensitive database information.
29. Use clean URLs. No query strings for navigation state that a path can express.
    Faceted listing state (search, filters, sort, page) is the exception and lives in
    validated query parameters.
30. Use slugs for public content where appropriate.
31. Build accessible interfaces. Semantic HTML, labels, focus states, keyboard support.
32. Build responsive interfaces. Verify mobile through desktop.
33. Optimize performance. Server Components by default, images via `next/image`.
34. Implement SEO properly. Metadata, canonical URLs, Open Graph, JSON-LD, sitemap.
35. Use reusable components. No copy-pasted card or layout markup.
36. Avoid unnecessary dependencies.
37. Keep business logic maintainable and in one obvious place per rule.
38. Do not leave debugging code in production. No `console.log`, stray comments, `.only`.
39. Do not leave real credentials in seed files.
40. Do not claim a feature is complete until it has been tested.

### Cleanliness

- No dead code, commented-out blocks, TODO markers without an owner, or unused exports.
- `npm run lint` and `npm run typecheck` must pass with zero errors before any phase is
  considered done.

---

## 5. Data Model Contract

PostgreSQL is the source of truth. Prisma owns the schema. Migrations are committed.

**Entities**

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `User` | Admin identity | `name`, `email` (unique), `passwordHash`, `role`, `isActive` |
| `Session` | Server-side session record | `tokenHash` (unique), `userId`, `expiresAt`, `revokedAt` |
| `Story` | A story | `title`, `slug` (unique), `author`, `shortDescription` (plain text), `description` (sanitized HTML), `coverImage` (private storage key), `status`, `featured`, `views`, `publishedAt`, `categoryId` |
| `Chapter` | A chapter of a story | `storyId`, `chapterNumber`, `title`, `slug`, `content` (sanitized HTML), `status`, `views`, `publishedAt` |
| `Category` | Story category | `name`, `slug` (unique), `description`, `image` |
| `Tag` | Story tag | `name`, `slug` (unique) |
| `StoryTag` | Many-to-many join | `storyId`, `tagId`, composite PK |
| `StoryView` | Anonymous view analytics | `storyId`, `chapterId`, `sessionId`, `viewedAt` |
| `LoginAttempt` | Brute-force tracking | `identifier`, `ip`, `succeeded`, `attemptedAt` |

**Content status** is an enum, never a loose string:

- `DRAFT` — not publicly visible in any form
- `PUBLISHED` — publicly visible
- `ARCHIVED` — removed from public, retained in admin

**Schema rules**

- Foreign keys on every relation. No orphaned rows. `Story` → `Chapter`, `StoryTag` and
  `StoryView` cascade; `StoryView` → `Chapter` sets null; `Story.categoryId` restricts so a
  category cannot be dropped while stories reference it.
- Unique constraints on `slug`, `email`, `("storyId", "chapterNumber")`, and
  `("storyId", "slug")`.
- Index every field used for filtering, sorting, or lookup: `status`, `slug`, `categoryId`,
  `featured`, `publishedAt`, `("storyId", "chapterNumber")`, `("storyId", "status")`,
  `StoryView("storyId", "viewedAt")`, `tokenHash`.
- `Session` stores `tokenHash` (unique) and `expiresAt`/`revokedAt`; it cascades from `User`.
  `LoginAttempt` stores attempt history only, with no foreign key. Both ship in the
  authentication migration.
- Enums over magic strings. Named types in TypeScript mirror Prisma enums.
- Schema changes ship as a migration: `npx prisma migrate dev --name <change>`.
  Never edit `schema.prisma` without a migration.
- Never expose the raw database to a browser. All access goes through server code.

---

## 6. Public Content Rules

**Only `PUBLISHED` stories and `PUBLISHED` chapters are public.** A published
story is public whether or not it has a published chapter: an unreadable story is
still listed and indexable. Its detail page omits the chapter list and the
"Start reading" action rather than showing a chapter-related notice.

`DRAFT` and `ARCHIVED` must never appear in:

- public listings or home page
- search results
- category pages
- tag pages
- story detail pages
- chapter pages
- related or recommended stories
- sitemap or `robots.txt`
- public metadata (title, description, Open Graph)
- public JSON endpoints
- RSS or any future public feed

**Implementation requirements**

- Every public query lives in `src/lib/queries/` and filters on `status = PUBLISHED`
  internally. Public components never write that filter themselves, so it cannot be
  forgotten at a call site.
- A published story is public regardless of whether any chapter is published. Readable
  chapters are published-only; the story detail page omits the chapter list and the
  "Start reading" action when none is published, without any chapter-related notice.
- Chapter navigation must only offer published siblings.
- Sitemap is generated from the shared public query layer, never from an admin query.
- Cache public reads (`revalidate`, `unstable_cache` or equivalent) and invalidate on
  admin publish/unpublish/delete.

Draft previews in admin are allowed and must be visually and structurally distinct from
public routes.

---

## 7. Authentication

**Passwords**

- Hash with Argon2id (preferred) or bcrypt with cost 12 or higher.
- Never store plain-text or reversibly encoded passwords.
- Never log passwords, hashes, or session tokens.
- Seed data contains no real credentials. Development seed users are generated from
  environment variables with a documented local-only default.

**Sessions**

- Secure sessions with opaque random tokens (at least 32 bytes of entropy).
- Store only a hash of the token server-side. A database leak must not yield usable
  session tokens.
- Token travels in an `HttpOnly`, `SameSite=Lax` cookie.
- `Secure` is mandatory in production.
- Sessions are revocable and carry an absolute expiry plus sliding renewal.
- Logout invalidates the session server-side, not just by clearing the cookie.
- Changing a password invalidates all other sessions for that user.
- Rotate the token on privilege change and on login.

**Brute force**

- Rate-limit login by identifier and by IP.
- Lock out or exponentially delay after repeated failures.
- Record attempts in `LoginAttempt`.
- Responses for unknown user and wrong password are identical. No user enumeration.
- Login errors never reveal whether an account exists, is inactive, or is locked.

**CSRF**

- Server Actions carry Next.js origin checks; keep that default intact.
- Any state-changing Route Handler must validate `Origin` or use a token.
- Cookies are `SameSite=Lax` unless a flow genuinely requires `None`, in which case it
  must be `Secure`.

---

## 8. Authorization

Authentication and authorization are separate concerns.

Every protected operation must verify, in order:

1. **Authentication** — a valid, unrevoked, unexpired session exists.
2. **Role** — the session's role meets the required role for the route or action.
3. **Permission** — the specific capability is allowed.
4. **Resource access** — the record belongs to the actor's scope, and the requested
   status transition is legal.

**Rules**

- Authorization is enforced in the server layer: layout guards, per-action checks,
  and per-handler checks.
- Never rely on hiding a UI element. Hidden buttons are not access control.
- Never read a role from a form field, hidden input, URL parameter, or client state.
- Roles come from the database, via the session, on the server.
- Default to deny. Missing policy means the request is rejected.
- The admin section is currently a single-tier `ADMIN` role. Design the permission check
  as a lookup so finer roles can be added without rewriting call sites.

**IDOR**

- Every read and mutation scoped by identifier must be scoped by authorization too.
- Never accept a bare id for admin mutations without a role check.
- Predictable public slugs are fine; predictable *admin* resource access is not.

---

## 9. Input Validation

- Validate every external input at the server boundary with Zod.
- Client validation is a UX affordance only. It is never a security control.
- Server Actions and Route Handlers parse their input before touching the database.
- Validation schemas live in `src/lib/validation/`, one module per domain
  (`story.ts`, `chapter.ts`, `user.ts`, `auth.ts`, `upload.ts`).
- Derive TypeScript types from Zod schemas. Do not duplicate shapes.
- Validate and normalize:
  - strings: trim, collapse internal whitespace where appropriate, enforce max length
  - slugs: lowercase, ASCII, hyphen-separated, unique-checked
  - pagination: integer, clamped range
  - enums: strict `z.enum`, never free strings
- Strip unknown keys from object input. Do not pass raw objects to Prisma.
- Reject oversized bodies. Upload endpoints enforce their own size ceiling.
- Sanitize search queries before they reach any query builder.

---

## 10. Rich Text

All rich text is untrusted input, regardless of who typed it.

**Editor**

- Tiptap, client-side only. The editor produces HTML or JSON; the server is the
  authority on what is stored.

**Sanitization**

- Sanitize on the server, on write, with an allowlist. Never a denylist.
- Never store unsanitized HTML, even from an admin.
- Never trust client-side sanitization as a substitute for server-side sanitization.

**Allowlist covers**

- A small set of text-formatting tags and inline styles
- Headings, paragraphs, lists, blockquotes, code blocks, links

**Must be stripped or rejected**

- `<script>` and any executable content
- `javascript:`, `vbscript:`, `data:` URLs in links and images
- `on*` event handlers
- `<iframe>`, `<object>`, `<embed>`, `<form>`, `<style>`, `<link>`, `<meta>`
- CSS `expression()`, `behavior:`, `-moz-binding:`, `position: fixed`
- SVG payloads and `srcdoc`
- Comments and doctype nodes
- Unknown attributes

**Additional rules**

- Link targets use `rel="noopener noreferrer"`.
- Render sanitized HTML only through components in `src/components/` that treat the
  content as untrusted. Never use `dangerouslySetInnerHTML` to render stored HTML outside
  that single layer.
- JSON-LD structured data is the one other sanctioned `dangerouslySetInnerHTML` usage. It
  is emitted only through `src/components/seo/JsonLd.tsx`, which serializes a plain object
  built server-side from published data (never stored HTML) and escapes `<` so a value
  cannot break out of the `<script>` element.
- Store a plain-text short description alongside the HTML for metadata and search,
  generated server-side from the sanitized output.
- Sanitization runs once on write. Sanitize again on render if the pipeline allows, as
  defense in depth for rows written before the rule existed.

---

## 11. Uploads

**Cover images**

- Store objects outside `public/` in a private bucket or under a non-served path. Serve
  through an image route or CDN URL.
- Storage credentials are server-only and never reach the client.

**Validation — all of the following**

- Allowlist of formats: `image/jpeg`, `image/png`, `image/webp`. Nothing else.
- Extension must match the MIME type and the allowlist.
- Maximum file size enforced on the server, for example 5 MB.
- Magic-byte / file-signature check so a renamed executable is rejected.
- Re-decode or re-encode with `sharp` when available, which strips embedded payloads.
- Reject images with no dimensions or implausible dimensions.

**Naming and storage**

- Generate object names with `crypto.randomUUID()`. Never reuse the uploaded filename.
- Never trust client-supplied filenames, paths, or extensions.
- Normalize extensions. No path traversal. No user-controlled directory segments.
- Scan or quarantine uploads when the environment supports it.
- Delete orphaned objects when a cover is replaced or a story is deleted.

**Failure handling**

- Validate before any object is written.
- If the database write fails after upload, remove the uploaded object.
- Errors must not leak bucket names, keys, or provider SDK messages.

---

## 12. Environments and Secrets

- All secrets live in environment variables.
- `.env` is never committed. `.env.example` is committed and documents every variable
  with purpose, format, and whether it is public.
- `NEXT_PUBLIC_*` is public by definition. Server-only secrets must never use that prefix.
- Access private variables only in server code: Server Components, Server Actions,
  Route Handlers, `src/lib`. Importing them into a Client Component is a build error
  to be fixed, not worked around.
- Validate required environment variables at startup with Zod and fail fast with a clear
  message. Do not silently default a secret to a weak value.
- No secrets in source, tests, seed files, fixtures, screenshots, error messages,
  analytics payloads, or client bundles.
- Rotate any secret that has been exposed. Removing it from the latest commit is not
  sufficient.

Required variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session/HMAC signing secret, 32+ bytes |
| `NEXT_PUBLIC_APP_URL` | Public base URL for canonical URLs |
| `STORAGE_ENDPOINT` | S3-compatible endpoint |
| `STORAGE_REGION` | Bucket region |
| `STORAGE_BUCKET` | Bucket name |
| `STORAGE_ACCESS_KEY_ID` | Storage credential |
| `STORAGE_SECRET_ACCESS_KEY` | Storage credential |
| `RATE_LIMIT_*` | Rate-limit tuning values |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Local-only seed admin |

---

## 13. Error Handling and Logging

- Never expose internal errors to users. No stack traces, SQL, Prisma messages, bucket
  keys, or env values in responses or UI.
- Users receive a safe message. Logs receive the detail, with correlation via a request
  id.
- Map expected failures to typed results or domain errors. Example: `{ ok: false, error }`
  for form failures, HTTP status codes for handlers.
- Unexpected failures become a generic message and a server-side log.
- Never `throw` raw internal errors to the client. Catch at the boundary.
- React error boundaries cover admin and public route segments so a bad payload cannot
  take down a page.
- No `console.log` in committed code. Use the project logger. Remove debug output.
- Never log passwords, tokens, session ids, or full request bodies.

---

## 14. Database Access Rules

- All access through Prisma. PostgreSQL is never exposed to browsers.
- Shared data access functions in `src/lib/queries/`. Pages call functions; they do not
  assemble ad hoc queries.
- Filter status inside those shared functions so public exposure rules cannot be bypassed.
- Transactions for anything that must be atomic: chapter reorder, publish flows,
  category or tag replacement, deletion with cascading records.
- Use `prisma.$transaction` for multi-write operations. Never rely on sequential writes
  for correctness.
- Guard against N+1. Use `include` / `select` deliberately, and paginate every list.
- Select only the columns needed. Do not return whole rows with password hashes or
  session tokens anywhere.
- Bulk operations use `createMany` / `updateMany` / `deleteMany` where appropriate.
- No raw SQL with interpolation. `$queryRaw` only with tagged templates;
  `$queryRawUnsafe` only with fully reviewed, non-user-controlled input.
- Soft delete versus hard delete is a product decision. Whichever is chosen, orphaned
  storage objects and rows must not remain.

---

## 15. Admin Route Protection

- Every `/admin/**` route is guarded server-side in the admin layout and re-checked in
  every Server Action and Route Handler.
- Unauthenticated access redirects to `/admin/login`. Authenticated access without permission
  returns a 403. Both are decided on the server.
- Mutations re-verify authorization at call time. A layout guard is not sufficient.
- Destructive actions require explicit confirmation: a typed confirmation or a named
  confirmation dialog, plus a Server Action re-check.
- Bulk destructive operations state exactly what will be deleted.
- Optimistic UI is allowed; optimistic *authorization* is not.

---

## 16. Public UX and SEO

- Clean URLs. Stories at `/stories/[slug]`, chapters at
  `/stories/[slug]/chapter/[chapterSlug]`, categories at `/categories/[slug]`, search at
  `/search?q=`.
- The catalogue at `/stories` accepts reader state as query parameters: `q`, `category`,
  `tag`, `sort` and `page`. Values are validated and normalized server-side (Zod) before
  any query; unknown or malformed values fall back to the default, and `page` is clamped
  to the real range. Filtered views are crawlable but `noindex`; the unfiltered page is
  canonical.
- Slugs are generated server-side from titles, normalized, and uniqueness-checked.
  Changing a slug of a published story requires a redirect record or an explicit
  acknowledgement of the broken-link tradeoff.
- Pagination on every list. Never render an unbounded collection.
- `generateMetadata` on every public route: title, description, canonical URL, Open
  Graph image. Descriptions come from stored, server-derived text.
- JSON-LD for `Story` / `Article` and `BreadcrumbList` where appropriate, built from
  published data only.
- `sitemap.ts` and `robots.ts` list published URLs only and disallow `/admin`.
- Accessible by default: semantic landmarks, one `h1` per page, labelled controls,
  visible focus, sufficient contrast, keyboard-operable menus and dialogs.
- Images: `next/image` with explicit width and height to avoid layout shift, meaningful
  `alt` text, empty `alt` for decorative images.
- Performance: Server Components first, client interactivity only where needed. Images
  optimized. Payloads measured before claiming an improvement.

---

## 17. Testing

**Before declaring any phase complete, all of the following must pass:**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` is required wherever a phase touches routes, layout, or data access.

**Coverage expectations**

- Unit tests for validation schemas, sanitization rules, permission logic, slug
  generation, and status-transition rules.
- Integration tests against a real PostgreSQL test database for queries and Server
  Actions, including the public-visibility guarantees.
- Authorization tests that prove non-admins cannot reach admin mutations. These are not
  optional.
- Security tests for XSS payloads in rich text, IDOR attempts, CSRF attempts, session
  reuse after logout, and brute-force lockout.
- E2E coverage of the critical journeys: browse → search → filter → read → navigate
  chapters, and admin login → create draft → edit → publish → verify public visibility →
  unpublish → verify removal.

**Test rules**

- No test asserts against hardcoded application data when the database is involved.
- Tests must be deterministic. Control time, slugs, and ids.
- Seed fixtures are clearly labelled as test data and hold no real credentials.
- A failing test is a blocker, not an accepted state.

---

## 18. Git and Change Hygiene

- Conventional, descriptive commit messages.
- One logical change per commit. Do not mix refactors with behaviour changes.
- Never commit secrets, `.env`, build output, or editor settings.
- Migrations ship with the code that depends on them.
- Review your own diff before declaring done. Remove debug code and stray logs.
- Do not commit or push unless explicitly instructed.

---

## 19. Quality Priority Order

When trade-offs conflict, resolve in this order:

1. Security
2. Correctness
3. Data integrity
4. Reliability
5. Accessibility
6. Performance
7. Maintaintainability

over unnecessary complexity. A smaller feature that is secure and correct beats a larger
one that is not.

---

## 20. Definition of Done

A feature is not complete because code was written.

A feature is complete only when all of the following hold:

- It works as specified in the real application.
- It is secure, and the threat checks in sections 7 to 15 are satisfied.
- It is tested, with tests that would fail if the behaviour regressed.
- It does not break existing functionality. Existing tests still pass.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
- No debug code, no secrets, no hardcoded data where the database is required.
- Documentation is updated if behaviour or contracts changed.

---

## 21. Working Method

1. Read `AGENTS.md`. Read the relevant `.agent/skills/*/SKILL.md`.
2. Inspect the existing code you will touch. Understand its patterns first.
3. Plan the smallest correct change. Say so plainly before building.
4. Implement, following the conventions already in the repo.
5. Secure the change: validation, authorization, sanitization, error handling.
6. Test it. Prove the behaviour, including the failure paths.
7. Run the full gate: typecheck, lint, test, build.
8. Review the diff. Report what changed and what remains.

If a requirement is ambiguous or conflicts with this document, stop and ask rather than
guessing.