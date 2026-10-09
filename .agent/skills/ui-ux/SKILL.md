# Skill: UI/UX

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

Define the visual and interaction standards for Eagles Eye: the design tokens, component
primitives, and layout patterns that the public reader site and the admin dashboard both
draw from. This skill exists to stop the interface from drifting into generic, unmemorable
AI-generated output and to keep accessibility measurable rather than aspirational.

Two audiences, one system:

- **Reader surface** (`/`, `/stories`, `/stories/[slug]`, chapter pages, `/search`, `/categories`) —
  long-form prose first, quiet chrome, nothing competing with the text.
- **Admin surface** (`/admin/**`) — dense, fast, keyboard-operable, information-first.

Shared primitives live in `src/components/ui/`. The site chrome lives in
`src/components/layout/` and `src/components/navigation/`. Reader composites live under
`src/components/stories/`, `src/components/chapters/`, and `src/components/search/`. Admin
composites live in `src/components/admin/`. A primitive is never duplicated inside a
feature folder.

## When to use

Read this skill before:

- Creating or changing any component in `src/components/`
- Adding a page under `src/app/(public)/` or `src/app/admin/`
- Introducing a color, spacing, or type scale value that is not already a token
- Changing layout, navigation, or responsive behavior
- Reviewing an interface for accessibility before shipping
- Touching loading, empty, or error states (they are part of the design, not afterthoughts)

Do not use it for pure data-access or domain logic work.

## Relevant files

| Path | Role |
| --- | --- |
| `src/app/globals.css` | Token definitions: color, type scale, spacing, radii, shadows |
| `tailwind.config.ts` | Maps tokens into Tailwind theme; the only place theme extends happen |
| `src/components/ui/` | Primitives: Button, Input, Textarea, Select, Badge, Card, Dialog, Table, Pagination, Skeleton, EmptyState, ErrorState, Alert |
| `src/components/layout/` | SiteChrome (header + main landmark + footer) |
| `src/components/navigation/` | SiteHeader, SiteFooter, Wordmark, Breadcrumbs |
| `src/components/stories/` | StoryCard, StoryGrid, FeaturedStory, CategoryCard |
| `src/components/chapters/` | ReadingLayout, ChapterNav, ChapterList, RichText |
| `src/components/search/` | SearchBar, result rows |
| `src/components/admin/` | Admin tables, forms, Tiptap editor wrapper, status controls, confirm dialogs |
| `src/app/layout.tsx` | Root layout: font loading, skip link, landmarks |
| `src/components/providers/ThemeProvider.tsx` | Theme state, only if dark/light is adopted |
| `src/lib/queries/` | Data shape the components render; controls which states are reachable |

## Implementation rules

### Visual hierarchy

- One focal element per view. On a story card that is the title; on a chapter page it is the
  chapter title and body. Everything else is subordinate.
- Establish hierarchy with size, weight, and spacing before color or decoration.
- Four levels maximum: page title, section heading, item title, supporting text. Do not
  introduce a fifth.
- Reading pages get exactly one `<h1>`. Never style a `<div>` to look like a heading.

### Typography

- Two families maximum. One for reading and UI, one for code if any. Load via `next/font`
  so there is no layout shift and no render-blocking third-party request.
- Reading prose: 18–20px base, line height 1.6–1.75, measure capped at 65–75 characters.
  Long-form text below 16px is a reading failure.
- Body copy `font-smoothing: antialiased` only if headings do not look thin against it.
- Use a modular scale with a fixed ratio. Never hand-pick an arbitrary `text-[17px]`.
- Headings use `text-balance`; paragraphs use `text-pretty`. Both are cheap and remove
  ragged last lines.
- Never set letter-spacing on body text. Tight negative tracking on large headings is
  acceptable; loose positive tracking belongs only to uppercase micro-labels.

### Spacing

- Use the spacing scale exclusively. No arbitrary pixel or rem values inline.
- Vertical rhythm matters more than horizontal. Sections get more space than the gap
  between siblings.
- Consistent card interior padding across every card variant.
- Use `gap` on flex/grid containers. Do not use margin for spacing between siblings —
  margin collapses unpredictably and breaks inside overflow containers.

### Color system

- Tokens only. Components never reference raw hex, `rgb()`, or arbitrary Tailwind color
  classes.
- Semantic names, not literal names: `surface`, `surface-raised`, `border`, `text-primary`,
  `text-muted`, `accent`, `danger`, `success`, `warning`. `gray-500` is not a semantic name.
- Define light and dark values per token. Never branch on theme inside a component.
- Status color is never the only signal. `DRAFT` / `PUBLISHED` / `ARCHIVED` always carry a
  text label; a badge also carries an icon or dot so it survives greyscale and colorblindness.
- Contrast: text 4.5:1 minimum, large text and UI borders 3:1. Verify both themes.

### Responsive layouts

- Mobile-first. Base styles target the narrow viewport; add breakpoints upward.
- Verify every change at 375px, 768px, and 1280px. Do not infer mobile from a shrunk
  desktop window.
- Touch targets minimum 44×44px. Small icon buttons get padding to reach it, not a
  larger icon.
- Tables collapse to stacked cards below `md` rather than scrolling horizontally. If
  horizontal scroll is unavoidable, the first column stays sticky.
- Set explicit `width` and `height` on every `next/image` so nothing shifts on load.

### Accessibility

Non-negotiable, and part of the Definition of Done:

- Semantic landmarks: `header`, `nav`, `main`, `footer`. Skip-to-content link is the first
  focusable element on every page.
- Every input has a real `<label>`. Placeholder is never the label. Errors associate with
  `aria-describedby` and use `aria-invalid`.
- Visible focus on every interactive element. Never `outline: none` without a replacement.
- All interactive elements are real `<button>` or `<a>` — never a clickable `<div>`.
- Dialogs: focus moves in on open, is trapped while open, returns to the trigger on close,
  `Escape` closes, background is inert.
- Icon-only controls carry `aria-label`. Decorative icons are `aria-hidden`.
- Color contrast holds in both themes. Focus rings visible in both themes.
- Reduced motion: respect `prefers-reduced-motion`. No parallax, no auto-playing animation.
- Lang attribute on `<html>`. Correct heading order, no skipped levels.

### Interaction design

- Every action gives immediate feedback: pending state on the control, success or error
  message after.
- Destructive actions use a named confirmation that states what will be deleted. Typing the
  story title is acceptable. `window.confirm` is not.
- Server Actions are the mutation path. Do not add client-side optimistic state for
  authorization — optimistic UI for latency is fine, optimistic trust is not.
- Forms: validate with Zod on the server; surface the field error inline next to the field,
  and a summary only when the submission fails for a non-field reason.
- Keyboard shortcuts where they help power users (`/` to focus search, `Esc` to close).
  Document them in a help popover rather than expecting discovery.

### Loading states

- Prefer server-rendered content. Skeletons only for genuinely client-fetched regions.
- Skeleton mirrors the real layout's dimensions. A spinner for a page with known structure
  is a downgrade.
- Route-level loading via `loading.tsx`; suspense boundaries around slow islands.
- Scope each `loading.tsx` to a route group (for example `stories/(catalogue)/`) so it never
  wraps a route that calls `notFound()`. A streaming fallback commits a `200` before
  `notFound()` runs, so the status can no longer be changed. Keep notFound routes (story
  detail, chapter reader, category detail) outside every loading boundary to preserve 404.
- Never render an empty grid while data loads and call it "no results". Loading, empty, and
  error are three distinct states.
- Disable the submit button during mutation and show a pending label. Do not let double
  submit fire twice.

### Empty states

- Every list has a designed empty state: what would be here, and the action that fills it.
- Reader-facing empty states are friendly and brief ("No stories yet — check back soon").
- Admin empty states carry a primary action: "Create your first story".
- Never render `null`, an empty array, or a bare "No data" string.

### Error states

- User-facing errors are safe and specific about what to do next. No stack traces, no
  Prisma messages, no bucket keys, no env values.
- Form errors: field-level, inline, with `aria-describedby`.
- Page-level failures render inside the route's error boundary with a retry affordance.
- 404 for a missing or non-published public resource — not a 200 with an empty page, and
  never a redirect that leaks the slug's existence to an unauthorized role. A true `404`
  requires that no `loading.tsx` sits above the route, so keep detail routes out of
  catalogue loading boundaries.
- Error boundaries wrap both public and admin segments so one bad payload cannot take down
  the site.

### Mobile navigation

- Header collapses to a disclosure button with `aria-expanded` and `aria-controls`.
- The menu is a real `<nav>`; links are real `<a>`. Closes on `Escape` and on route change.
- Focus returns to the trigger on close. Background scroll locks while open.
- The reading interface keeps navigation minimal — nothing overlays the prose column.
- Admin on mobile stays functional: stacked layouts, no hover-only affordances, tap targets
  sized for thumbs.

### Story cards

- Reused everywhere it appears: home, listing, category, search results, related stories.
  One component, one implementation.
- Cover image, title, short description (clamped to a fixed line count so cards align), category badge,
  and metadata when known. Public cards never render volume counts (chapter or read totals); those are
  admin-only. Author is not a field in this data model — do not invent one.
- Whole card is not a bare link. Title is the link; the stretched-link pattern keeps one
  accessible name per card.
- Fixed aspect ratio on covers with `next/image` and explicit dimensions.
- The card must be readable at 375px with a long title. Test with the longest real title.

### Reading interface

- Single centered column. Prose measure 65–75 characters.
- Chapter title, breadcrumb, body, then chapter navigation. Nothing floats over the text.
- Previous/next use labels readers understand ("Previous chapter", "Next chapter"), not
  bare arrows.
- Reading progress is a thin, non-blocking indicator; respect reduced motion.
- Body text renders through the single sanctioned sanitized-HTML component. No other
  `dangerouslySetInnerHTML` renders stored HTML; JSON-LD goes only through
  `src/components/seo/JsonLd.tsx`.
- Sanitized HTML content styles come from an explicit typography block, not from arbitrary
  classes surviving sanitization.
- Paragraph spacing generous. Long sessions of prose are the product.

### Admin dashboard

- Information density over decoration. Compact rows, tabular numerals, aligned columns.
- Persistent left nav on `lg` and up; collapses to a drawer below.
- Status is shown as a badge plus an explicit control. Publishing is never a hover-only
  action.
- Tables: sticky header, sortable columns only where the query actually supports it,
  server-side pagination, and a visible row count.
- Reorder controls are explicit buttons with accessible names ("Move chapter 3 up"), never
  drag-only.
- Stats are plain figures with labels, not gauge charts. A dashboard is a lookup surface.

### Forms

- One column. Label above input. Help text below. Error below that.
- Consistent control height across every form so pages look composed.
- Required fields marked; optional fields say "optional".
- Never disable a submit button as the only validation signal — the user cannot see why.
- Preserve input on validation failure. Never clear a form to report an error.
- Group related fields with `fieldset` and `legend` where the relationship is not obvious.

### Dialogs

- One component, used for confirm, delete, and form-in-dialog. Never hand-rolled per page.
- Trap focus, close on `Escape`, restore focus to the trigger.
- Title is the accessible name. Close button has `aria-label`.
- Destructive dialogs name the affected record: "Delete 'The Salt Road'?" and state what
  happens to its chapters and cover.
- Backdrop click closes only for non-destructive dialogs.
- Body scroll locked; on mobile the dialog is a full-height sheet, not a tiny centered box.

### Buttons

- Variants: primary, secondary, ghost, danger. Sizes: sm, md, lg. That is the whole set.
- Variants differ by more than color: border, weight, and background all change, so the
  meaning survives greyscale.
- Icon-only buttons require `aria-label` and hit 44px.
- Loading state swaps the label for a pending indicator and sets `disabled` — but keep
  `aria-disabled` semantics so screen readers announce the change.
- No more than one primary button per view region.
- `type` is always explicit. Defaulting to `submit` inside a form is a real bug source.

### Tables

- Semantic `<table>` with `<caption class="sr-only">` naming the table.
- Header cells are `<th scope="col">`. Row headers use `scope="row"` for the identifying
  column.
- Numeric columns right-aligned with `tabular-nums`.
- Every row has a stable identifier in the DOM for keyboard navigation and testing.
- Sortable headers are buttons inside the `th`, with `aria-sort` on the `th`.
- Empty, loading, and error states render inside the table container, not as a bare page.

### Pagination

- One shared component driven by the query layer's page and total count.
- Admin shows a real range ("Showing 21–40 of 137"). Public read views pass `showSummary={false}` and
  render controls only: page numbers and prev/next. Public volume is never stated.
- Prev/next disabled at boundaries with `aria-disabled` and an accessible reason.
- Page numbers are links so they are crawlable, shareable, and middle-clickable.
- Preserve the current search query and filters across pages; drop them when the term is
  cleared. No query strings for state a path can express.
- Never render an unbounded list to paginate after the fact.

### Dark/light theme decisions

Default to light-only for the reader surface. Justify adoption of a theme before building it:
it doubles the contrast-review surface and the token maintenance cost, and reading apps are
overwhelmingly used in light conditions.

If dark mode is adopted, it is class-based, respects `prefers-color-scheme`, allows an
explicit override, and requires:

- Tokens defined for both themes. No component reads the theme to pick a class.
- Contrast re-verified in dark. Elevation expressed with surface lightness and border
  contrast, never with heavy shadows that turn into smudges on dark backgrounds.
- Images and covers checked against dark surfaces for contrast at the edges.
- Theme choice persisted without flashing on load — inline script before paint, and the
  class must not shift layout.
- `color-scheme` set so native controls and scrollbars match.

Do not ship a half-themed surface. One complete theme beats two inconsistent ones.

### Avoiding generic AI-generated interfaces

These are the specific failure modes to reject in review. They are what makes an interface
read as machine-made:

- **Default Tailwind starter palette.** Indigo-600 on white with a gray-50 page. Choose a
  deliberate palette and own it.
- **Centered everything.** Full-width centered cards in a single stack. Use real editorial
  grids with intentional asymmetry.
- **Uniform card soup.** Every object is an identical rounded rectangle with a title and two
  gray lines. Differentiate by content importance, not one template.
- **Excess gradient.** Purple-to-blue hero gradients, gradient text on headings, gradient
  buttons. If a gradient is not carrying meaning, delete it.
- **Glassmorphism and heavy blur.** Blurred translucent panels over a photo background,
  everywhere. It costs performance, destroys contrast, and is the clearest AI tell.
- **Icon-in-a-tinted-circle.** Every feature gets a 48px rounded square with a Lucide icon
  in it. Use icons only where they aid scanning.
- **Fake statistics.** Invented "10k+ readers" or a metric with no real source. Never
  display a number that is not derived from the database.
- **Empty decorative hero copy.** A large headline saying "Read stories." over an abstract
  shape. Say something true about the actual catalog.
- **Inter everywhere by reflex.** One grotesque, no scale discipline, tight tracking on
  body text. Pair a text face for reading with a UI face if the content warrants it.
- **Uniform 8px rounding and identical padding everywhere.** Rhythm should vary with
  content role.
- **Animations that reveal nothing.** Fade-up-on-scroll on static content, pulsing hover
  states. Motion must indicate state change or spatial relationship.
- **Placeholder personality.** Lorem ipsum, "Story Title Here", avatar images with initials,
  or a "Coming soon" section standing in for an unbuilt feature. Build the real state or
  design the real empty state.

Counter-rule: restraint is not the same as blandness. The bar is *considered*, not
*decorated*. A plain, deliberate, well-spaced interface beats a busy one.

## Security requirements

- UI never enforces access control. Hidden or disabled controls are affordances, not
  authorization. Every Server Action re-checks authentication, role, permission, and
  resource access server-side.
- Sanitized chapter HTML renders only through the one sanctioned component. Any new
  `dangerouslySetInnerHTML` that renders stored HTML outside it is a review blocker.
  The only other sanctioned use is JSON-LD via `src/components/seo/JsonLd.tsx`, which
  serializes a server-built object and escapes `<`.
- Confirmation dialogs improve safety but never replace the server-side re-check, and the
  confirmed action must re-validate that the record still exists and is still deletable.
- No secret, internal URL, bucket key, stack trace, or env value in any UI string, error
  toast, or empty state.
- External links use `rel="noopener noreferrer"`. Any URL from user data is validated against
  an allowlist of protocols before rendering.
- Sanitized HTML strips `javascript:` URLs and `on*` handlers; do not re-introduce them via
  dangerouslySetInnerHTML, inline styles, or a data attribute the sanitizer keeps.
- Inline SVG from user data is not rendered. Icons come from Lucide, not from stored markup.
- CSP must not be weakened with `unsafe-inline` to make a styling technique work.
- Images served from private storage only through the authorized image route or CDN URL.

## Testing requirements

Per feature, in addition to the four-command gate (`npm run typecheck`, `npm run lint`,
`npm test`, `npm run build`):

- **Accessibility**: automated axe checks on every new page in the Playwright suite. A
  critical or serious violation fails the build.
- **Keyboard**: a Playwright test that tabs through the primary flow of any new interactive
  surface, opens and escapes a dialog, and asserts focus returns to the trigger.
- **Contrast**: verified in both themes where a theme exists. Asserted or reviewed per token
  change, not assumed.
- **Responsive**: at least one assertion at 375px and one at 1280px for any new layout,
  including no horizontal overflow of the page body.
- **States**: loading, empty, error, and success each rendered deliberately. A test that
  asserts the empty state is distinguishable from the loading state.
- **Long content**: a test fixture with the longest realistic title, a 200-character
  short description, and a story with zero published chapters, asserting nothing overflows or collapses.
- **Status legibility**: status remains identifiable without color — assert the text label
  is present in the DOM.
- Visual regression: screenshot baselines for the reading interface and admin tables, so an
  unintended layout shift is caught.

## Common mistakes

| Mistake | Why it is wrong | Fix |
| --- | --- | --- |
| Hiding admin UI as "authorization" | Client state is attacker-controlled | Guard server-side in the layout and in every action |
| `dangerouslySetInnerHTML` in a new component | Reopens the stored-XSS vector | Use the one sanctioned rich-text render component; JSON-LD only via `JsonLd` |
| `window.confirm` for deletes | Unstyled, inaccessible, no record naming | Shared `ConfirmDialog` naming the target |
| Skeleton identical to the empty state | User cannot tell loading from "nothing here" | Distinct skeleton, distinct empty state, distinct error |
| Unbounded list paginated in the browser | Ships every row, breaks SEO and perf | Paginate in the query layer |
| New color via `text-indigo-600` | Bypasses tokens, breaks dark mode | Add a semantic token, use it |
| `outline: none` with no replacement | Keyboard users lose focus entirely | Visible `:focus-visible` ring in both themes |
| Icon button with no `aria-label` | Announced as an unlabelled button | Label it or use the shared primitive |
| Dialog that does not trap focus | Tab escapes to background content | Shared dialog primitive handles it |
| Drag-only chapter reorder | Keyboard and screen-reader users excluded | Explicit move buttons with accessible names |
| Invented stats on the dashboard | Fake data, and AGENTS.md forbids it | Query real counts, show nothing when empty |
| Missing width/height on images | Layout shift, CLS penalty | Explicit dimensions plus `next/image` |
| Client-side validation as the only check | Trivially bypassed | Zod on the server is the real boundary |
| Fabricated author or rating UI | Fields do not exist in the data model | Do not invent schema to satisfy a layout |
| `console.log` left in a component | Debug output in production | Remove it; use the project logger |

## Completion checklist

Design and tokens:

- [ ] Only tokens used. No raw hex, no arbitrary spacing, no inline sizes.
- [ ] Semantic color names, with values defined for every theme in use.
- [ ] Contrast verified: 4.5:1 body text, 3:1 large text and borders.
- [ ] Type scale and spacing scale respected; no one-off values.
- [ ] Motion respects `prefers-reduced-motion`.

Structure and semantics:

- [ ] Semantic landmarks, skip link first in tab order.
- [ ] Exactly one `<h1>` per page; heading levels never skipped.
- [ ] Real `<button>` / `<a>` for all interaction; no clickable `<div>`.
- [ ] Every input has a real `<label>`; errors use `aria-describedby` and `aria-invalid`.

Accessibility:

- [ ] Visible focus ring on every interactive element, in every theme.
- [ ] Dialogs trap focus, close on `Escape`, restore focus to the trigger.
- [ ] Icon-only controls have `aria-label`; decorative icons are `aria-hidden`.
- [ ] Touch targets at least 44×44px.
- [ ] Axe passes with zero critical or serious violations.

States:

- [ ] Loading, empty, error, and success states all designed and visually distinct.
- [ ] No form is cleared to show an error; input is preserved on failure.
- [ ] Submit buttons show pending state and cannot double-fire.

Responsive:

- [ ] Checked at 375px, 768px, and 1280px. No horizontal overflow at 375px.
- [ ] Tables stack or scroll deliberately below `md`.
- [ ] Mobile nav opens, traps focus, closes on `Escape`, restores focus.

Domain surfaces:

- [ ] Story card is the shared component everywhere it appears.
- [ ] Reading interface uses the sanctioned sanitized-HTML renderer, prose measure 65–75ch.
- [ ] Chapter nav offers only PUBLISHED siblings.
- [ ] Admin tables have captions, `scope` attributes, server-side pagination, row counts.
- [ ] Destructive dialogs name the target and state the consequences.
- [ ] Publish/unpublish controls are explicit and keyboard reachable.

Quality:

- [ ] Pagination shows a real item range and preserves filters.
- [ ] All `next/image` usage has explicit width and height.
- [ ] No invented statistics, placeholder copy, or lorem ipsum.
- [ ] No generic-AI tells: no gratuitous gradients, blur panels, tinted icon circles, or
      fade-up animations on static content.
- [ ] Every new page has an axe test plus a keyboard traversal test.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.