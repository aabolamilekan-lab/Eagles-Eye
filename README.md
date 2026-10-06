# Eagles Eye

A story publishing and reading platform. Visitors browse, search, and read published
stories and chapters. Administrators manage stories, chapters, categories, tags, covers,
and the publishing workflow.

**This repository is at the initialization stage.** The toolchain is configured and
verified. No business functionality has been implemented yet.

## Status

| Area | State |
| --- | --- |
| Next.js App Router, React, TypeScript, Tailwind, ESLint | Configured and verified |
| Strict TypeScript beyond `strict: true` | Configured |
| PostgreSQL, Prisma, migrations | Not started |
| Authentication and sessions | Not started |
| Public reader experience | Not started |
| Admin dashboard | Not started |
| Uploads and object storage | Not started |
| SEO, sitemap, robots | Not started |
| Design system (tokens, primitives, composites) | Built, documented in `docs/design-system.md` |
| Test suite (Vitest unit) | Configured; contrast and `cn` covered |
| Test suite (Playwright E2E) | Not started |

## Requirements

- Node.js 20.9 or newer (developed against Node 24)
- npm 10 or newer
- PostgreSQL 14 or newer, for the database phase
- An S3-compatible bucket, for the media phase

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

The dev server runs at <http://localhost:3000>.

On Windows, if the shell blocks `npm.ps1`, prefix with `npm.cmd`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint across the project |
| `npm run lint:fix` | ESLint with autofix |
| `npm run typecheck` | `tsc --noEmit`, no emit |
| `npm test` | Vitest unit tests, single run |
| `npm run test:watch` | Vitest in watch mode |

## Environment

`.env.example` is the documented contract. Copy it to `.env.local` and fill in real
values. `.env.local` is git-ignored and must never be committed.

Only `NEXT_PUBLIC_`-prefixed variables reach the browser. Every server-only secret
belongs in the other variables, accessed exclusively from server code. Environment
variables are validated with Zod at startup in the authentication phase; until then
missing variables surface as runtime errors rather than a fast failure.

## Architecture

- `src/app/(public)/` — public reader routes
- `src/app/admin/login/` — admin sign-in (outside the guarded group)
- `src/app/admin/(dashboard)/` — guarded admin routes
- `src/components/ui/` — design-system primitives
- `src/components/layout/` — page chrome that composes the navigation
- `src/components/navigation/` — header, footer, wordmark, breadcrumbs
- `src/components/stories/`, `chapters/`, `search/` — feature composites
- `src/components/admin/` — admin shell, forms, editors
- `src/lib/` — database client, auth, validation, sanitization, storage, queries
- `src/actions/` — Server Actions grouped by domain
- `prisma/` — schema, migrations, seed
- `tests/unit/`, `tests/e2e/` — test suites

The design system, shared components, both route trees, and the Vitest unit suite exist.
Prisma, the query layer, authentication, and the e2e suite do not; admin routes currently
fail closed to `/admin/login`.

## Governance

`AGENTS.md` is the global source of truth for this project: data model, security rules,
auth and authorization contracts, and the definition of done. Read it before changing
anything.

Specialized rules live in `.agent/skills/<domain>/SKILL.md`, one per domain:

`database`, `authentication`, `authorization` rules inside `security`, `story-management`,
`chapter-management`, `admin-dashboard`, `reader-experience`, `search`, `media-upload`,
`seo`, `testing`, `security`, `deployment`, `ui-ux`.

Read the relevant skill before specialized work.

Before declaring any phase complete, all four of these must pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` currently runs the Vitest unit suite. The Playwright end-to-end suite arrives
with the reader and admin phases. `scripts/verify-contrast.mjs` additionally asserts the
colour tokens meet WCAG AA.