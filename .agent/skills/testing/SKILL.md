# Skill: Testing

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

AGENTS.md section 17 requires the four-command gate and the coverage classes. This skill states how the suite is wired: what each test type is allowed to touch, how the test database is created and isolated, how time and ids are made deterministic, and the exact authorization, security, and E2E cases that must exist before a phase can be called done.

## When to use

- Adding any feature, bug fix, or refactor that changes behaviour.
- Touching `src/lib/queries/`, `src/actions/`, `src/lib/auth/`, `src/lib/sanitize/`, or `src/lib/validation/`.
- Changing the schema, the public-visibility rules, or any status transition.
- Adding or changing a test, a fixture, a Playwright spec, or the Vitest configuration.
- Before declaring any phase complete, or before reporting a defect as fixed.

## Relevant files

| Path | Responsibility |
| --- | --- |
| `package.json` | `typecheck`, `lint`, `test`, `build`, `test:e2e`, `db:test:reset` scripts. |
| `vitest.config.ts` | Unit and integration projects, setup files, environment. |
| `tests/setup/` | Global setup: test schema application and per-run database provisioning. |
| `tests/helpers/db.ts` | `resetDatabase`, `seedFactory`, transaction-per-test wrapper. |
| `tests/helpers/auth.ts` | Creates users and sessions directly, for authorization tests. |
| `tests/helpers/time.ts` | Clock control for expiry, lockout, and `publishedAt` assertions. |
| `tests/unit/` | Pure logic: validation, sanitization, permissions, slugs, transitions. |
| `tests/integration/` | Queries and Server Actions against real PostgreSQL. |
| `tests/e2e/` | Playwright specs for the two critical journeys. |
| `playwright.config.ts` | `webServer` command, base URL from `NEXT_PUBLIC_APP_URL`, trace on failure. |
| `.env.test.example` | Test-only env contract, value-free. |

## Implementation rules

**The gate**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

- Run all four, in that order, before reporting a phase complete. A skipped `build` is a blocker wherever routes, layout, or data access changed.
- A failing test is a blocker. Not a known issue, not an accepted state, not a follow-up ticket.
- Fix the cause. Never weaken an assertion, add a skip, use `.only`, or raise a timeout to make a gate pass.
- `npm run lint` must fail on `console.log`, `.only`, unused exports, and unhandled promise rejections.

**Test types and boundaries**

| Type | Runs against | Must not |
| --- | --- | --- |
| Unit | Pure functions in `src/lib/validation`, `sanitize`, `auth/password`, `auth/permissions`, slug helpers | Touch the network, the database, or `Date.now()` |
| Integration | Real PostgreSQL test database via `tests/helpers/db.ts` | Mock Prisma, substitute an in-memory client, or assert on an interface double |
| E2E | A running Next.js server plus the test database | Reach a production host or a shared database |

- Integration tests use the same Prisma client and the same query and action modules as production. A fake Prisma client proves nothing about SQL, constraints, or transactions, and hides exactly the bugs these tests exist to catch.
- Unit tests are for logic only. Anything needing a transaction is an integration test.
- E2E asserts user-visible outcomes, not implementation detail. Do not assert on a store, a component name, or a data attribute that exists only for the test.

**The test database**

- `DATABASE_URL` for tests points at a dedicated database, never a development one and never a hosted environment. `tests/setup` refuses to run against a non-local host.
- The suite creates the schema with `npx prisma migrate deploy` against the test database, then applies migrations only; it never runs `migrate dev` in CI.
- Each test file or test resets to a known state through `resetDatabase`, truncating in dependency order: `StoryTag`, `Chapter`, `Session`, `LoginAttempt`, `Story`, `Category`, `Tag`, `User`. Use `TRUNCATE ... RESTART IDENTITY CASCADE` or `deleteMany` in one transaction; never hand-written SQL with interpolation.
- Integration tests share one database but never share state. Two suites must not read each other's rows. Prefer `describe` blocks that each reset, and run files sequentially if the runner cannot guarantee isolation.
- Wrap each test in a rollback transaction when the code under test accepts a transaction client; otherwise reset explicitly. Do not leave a test that truncates mid-suite.
- Tests seed through factories, never through `prisma/seed.ts`. Fixtures are labelled test data and hold no real credentials; admin credentials come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` test values or a purpose-built helper.

**Determinism**

- No real clock dependence. `expiresAt`, `publishedAt`, lockout windows, and sliding renewal are asserted through the `tests/helpers/time.ts` control, never by sleeping.
- No real randomness in assertions. Slugs, tokens, and ids used in assertions come from the created row or from an injected generator stub.
- No network calls. Fetch, S3, and mail are stubbed at the module boundary with a fixture response; the stub is explicit and reset between tests.
- No ordering dependence between tests, and no dependence on a previous run's rows.
- Timezone and locale pinned in the Vitest and Playwright configs so date formatting assertions are stable.

**Naming and structure**

- File names mirror the unit under test: `tests/unit/validation/story.test.ts`, `tests/integration/queries/stories.test.ts`, `tests/e2e/reader-journey.spec.ts`.
- Test names state the behaviour and the condition: `it("returns 404 for a DRAFT story on the public detail route")`, not `it("works")`.
- One behaviour per test. A test asserting five unrelated things will pass while four of them are wrong.
- Use a factory with overrides rather than copy-pasted object literals, so a schema change breaks in one place.

## Security requirements

- Tests must not require privileged external access: no production database, no real storage bucket, no live payment or mail provider.
- Test fixtures contain no real secrets, tokens, or personal data. Generated values are obviously fake and labelled.
- Never disable TLS verification, auth, CSP, or rate limiting in a test configuration to make a test pass. If a control blocks a test, fix the test's approach.
- Truncate rather than drop. A test run must not leave the schema in a state that hides a migration defect.
- The test user is not a real person and holds no real permissions beyond what the test asserts.
- Traces, screenshots, and videos from Playwright are gitignored; they can contain rendered content from the test database.
- `tests/` is committed code and is reviewed with the same scrutiny as `src/`, including for logging of tokens.

## Testing requirements

**Authorization cases (not optional)**

- A request with no session to every `/admin/**` route redirects to `/admin/login`.
- A valid session with a non-admin role receives 403 on every admin Server Action, including ones invoked directly, bypassing the UI.
- A non-admin cannot create, edit, publish, unpublish, or delete a story, chapter, category, or tag; the row is unchanged after the attempt.
- A non-admin cannot upload a cover or reorder chapters.
- A role of `ADMIN` is read from the database. Changing the row changes access without a redeploy.
- A missing permission entry denies by default.
- An inactive user (`isActive: false`) with an unexpired session is rejected.

**Security cases**

- XSS: `<script>`, `<img onerror>`, `<svg onload>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<style>`, comment and doctype payloads, `javascript:` hrefs, `data:` URLs, and CSS `expression()` are all stripped or rejected on write, and the stored row is inert when rendered.
- SQL injection: a slug or search term containing `'`, `"; DROP TABLE`, and a comment marker is handled as data; the table survives.
- IDOR: a valid admin session acting on a story, chapter, or category id that is not in scope is rejected.
- CSRF: a state-changing Route Handler invoked with a foreign `Origin` is rejected; the cookie remains `SameSite=Lax`.
- Session reuse: the token captured before logout is rejected afterwards, and every other session for that user is invalidated after a password change.
- Brute force: repeated failures produce a lockout within the configured window, and the response for a locked account is identical to the response for an unknown user.
- Upload: a renamed executable, an oversized body, a MIME mismatch, and an image with a non-image magic header are all rejected with no stored object.

**Public-visibility cases**

- A `DRAFT` or `ARCHIVED` story is absent from the home page, list, search, category page, tag page, sitemap, and JSON endpoints.
- A `DRAFT` chapter is absent from sibling navigation and returns no page.
- A published story with no published chapters renders the empty state rather than an error.

**E2E critical journeys (Playwright)**

1. Reader: home page to a story, search for a term, filter by category, open a story, read a chapter, navigate to the next and previous chapter by link, and confirm the chapter index updates.
2. Admin: log in, create a draft story, add a chapter, edit it, publish the story and chapter, verify the story and chapter are publicly visible, unpublish, and verify they are gone from the public listing, search, and sitemap.

- E2E assertions use visible text and roles, never CSS implementation selectors.
- `playwright.config.ts` starts the server against the test database; it must never run against a shared environment.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Mocking Prisma to test a query | Use the real test database; mocks hide constraint and transaction bugs |
| Writing an in-memory Prisma stand-in | Delete it; integration runs against real PostgreSQL |
| `vi.useFakeTimers()` only in one file, leaving order dependence | Centralise clock control in `tests/helpers/time.ts` |
| `await new Promise(r => setTimeout(...))` to wait for an async write | Await the returned promise or the action result |
| Asserting a fixed id or slug created by a previous test | Read the value back from the row or the factory return |
| Seeding with `prisma/seed.ts` in a test | Use `tests/helpers/db.ts` factories |
| Asserting a draft is hidden only on the listing page | Assert on list, detail, search, category, tag, and sitemap |
| Proving authorization by asserting a button is hidden | Invoke the action or route directly and assert the rejection |
| `test.only` left in to speed up local runs | Remove it; the gate runs the whole file |
| A snapshot committed for full HTML output | Assert the specific behaviour that matters |
| Sleeping for a lockout window | Advance the injected clock |
| Treating a skipped suite as a pass | Report it as a blocker, not a green run |

## Completion checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass, in order, with zero skips.
- [ ] Integration tests run against a real PostgreSQL test database with no Prisma mock and no in-memory substitute.
- [ ] The test database is dedicated, local, and reset per test; no cross-test pollution and no ordering dependence.
- [ ] Time, randomness, network, and storage are injected or stubbed; no test sleeps on a real clock.
- [ ] Fixtures use factories, hold no real credentials, and come from `tests/helpers/db.ts`.
- [ ] Authorization cases cover anonymous, non-admin, inactive, and default-deny paths.
- [ ] Security cases cover XSS, SQLi, IDOR, CSRF, session reuse after logout, brute-force lockout, and malicious uploads.
- [ ] Public-visibility cases assert drafts and archived rows are absent from every public surface including the sitemap.
- [ ] Both Playwright journeys pass: reader browse to chapter navigation, and admin draft to publish to unpublish with public verification.
- [ ] No `.only`, no skipped tests, no weakened assertions, no committed traces or screenshots.
- [ ] `npm audit` reviewed and reported.