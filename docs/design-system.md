# Eagles Eye design system

This document records the decisions behind the Eagles Eye interface. It exists so the
visual language is a set of deliberate choices rather than a set of habits, and so a
future change can tell whether it is extending the system or drifting from it.

The global contract is `AGENTS.md`. The UI rules are `.agent/skills/ui-ux/SKILL.md`. This
file explains the *why*; those two files carry the *must*.

The rendered reference is the `/design-system` route. It is a development artifact, not a
product surface, and is removed once the reader experience phase builds the real pages.

## 1. Visual direction

Editorial, calm, built for reading. The product is long-form prose, so the interface
recedes and the text leads. Concretely:

- **Paper, not chrome.** A warm off-white page and white surfaces. No gradients, no blur,
  no glass, no tinted icon circles.
- **Borders, not shadows.** Hairline borders carry separation. Shadow is reserved for
  surfaces genuinely floating above the page (dialogs, menus, raised cards).
- **One flourish.** The short oxblood rule under a chapter heading. It marks the top of
  the text column without a card or a shadow.
- **Type does the work.** Hierarchy comes from size, weight, and spacing before colour or
  decoration.

Deliberately rejected, because they read as machine-made: default Tailwind palette
(indigo on gray-50), centered stacks of identical rounded cards, decorative hero copy,
invented statistics, fade-up-on-scroll animation on static content, and placeholder
copy.

## 2. One theme: light only

Light-only is a decision, not an omission. A second theme doubles the contrast-review
surface and the token-maintenance cost, and a reading app is overwhelmingly used in light
conditions. No component reads a theme to pick a class — there is nothing to read.

Dark mode is deferred, not forbidden. If it is adopted later, it is class-based, tokens are
defined for both themes, and contrast is re-verified with `scripts/verify-contrast.mjs`
extended to both palettes.

## 3. Colour

Tokens live in `src/app/globals.css` under `@theme`. Components reference semantic token
utilities only (`bg-surface`, `text-ink-muted`, `border-border-strong`). No component
contains a raw hex value or an arbitrary Tailwind palette colour.

| Token | Value | Role | Contrast |
| --- | --- | --- | --- |
| `paper` | `#faf8f5` | Page background | — |
| `surface` | `#ffffff` | Cards, panels, inputs | — |
| `surface-sunken` | `#f2eee7` | Recessed strips, skeletons, code | — |
| `ink` | `#1a1817` | Primary text | 16.7:1 on paper |
| `ink-muted` | `#55504a` | Secondary text | 7.5:1 on paper |
| `ink-subtle` | `#6e675e` | Tertiary text, metadata | 5.3:1 on paper |
| `border` | `#e3ded5` | Decorative hairlines only | — |
| `border-strong` | `#8c8378` | Input and control edges | 3.5:1 on paper |
| `primary` | `#7c2d26` | Oxblood. Brand, primary action | 8.8:1 on paper |
| `accent` | `#1f4d4a` | Deep teal. Links, secondary emphasis | 8.9:1 on paper |
| `success` | `#2e6b41` | Success text | 6.4:1 on surface |
| `warning` | `#8a5a0b` | Warning text | 5.9:1 on surface |
| `error` | `#a32222` | Error and destructive text | 7.5:1 on surface |

Rules:

- `border` is decorative. A control must never rest on `border` alone as its edge; inputs
  use `border-strong` so the boundary survives low vision and greyscale.
- Status is never encoded by colour alone. `DRAFT` / `PUBLISHED` / `ARCHIVED` always carry
  a text label, and badges carry a dot as a second, colour-independent signal.
- Tinted surfaces (`*-surface`) exist only to seat saturated text. Text on a tint always
  uses the corresponding saturated token, never the tint.

`scripts/verify-contrast.mjs` reads the tokens directly from `globals.css` and asserts
WCAG AA for every pairing the system uses (4.5:1 for text, 3:1 for UI boundaries). It exits
non-zero on failure and must be re-run after any colour change.

## 4. Typography

Two families, both loaded through `next/font` so there is no layout shift and no
render-blocking third-party request.

- **Newsreader** — display and reading. A variable serif with an optical-size axis, so one
  file serves both the large display cut and the sturdy 19px reading cut.
- **Archivo** — UI, labels, controls, metadata.
- **System mono** — code only. No webfont is downloaded for it.

The scale is defined once, in `@theme`, and exposed as intent utilities
(`font-display`, `font-ui`, `label-micro`, `text-display-*`, `text-prose`). A component
never assembles size, weight, and tracking by hand.

- Display sizes (`display-xl` → `display-sm`) are **fluid** with `clamp()`, so heading line
  breaks are intentional at every width.
- Heading sizes (`heading-lg` → `heading-xs`) are **fixed**, because UI headings must not
  reflow when the viewport changes.
- Reading prose is 19px at line height 1.75. Long-form text below 16px is a reading
  failure.
- Headings use `text-balance`; paragraphs use `text-pretty`.
- Positive letter-spacing is allowed in exactly one place: `label-micro`, the uppercase
  micro-label. Body text never gets tracking.

## 5. Spacing, radius, elevation

- **Spacing** is a 4px base, expressed through Tailwind's numeric scale. No arbitrary
  pixel or rem values inline.
- **Vertical rhythm** is deliberate: tighter within a component (4–12px), larger between
  siblings (16–24px), larger again between components (32–48px), and `--spacing-section`
  (80px) between page sections.
- **Layout** uses `gap` on flex and grid. Sibling margins are avoided — margin collapses
  unpredictably and breaks inside overflow containers.
- **Radius** is role-based: `sm` (3px) for inputs and small controls, `md` (5px) for
  buttons and cards, `lg` (8px) for dialogs, `full` for pills and dots. It is not uniform,
  because uniform rounding is a generic-design tell.
- **Elevation** is restrained. `shadow-sm` confirms a raised card, `shadow-md` a hovered
  interactive card, `shadow-lg` dialogs and menus. Everything else separates with borders.

## 6. Components

Primitives live in `src/components/ui/`. Page chrome lives in
`src/components/layout/` and `src/components/navigation/`. Feature composites live in
`src/components/stories/`, `src/components/chapters/`, `src/components/search/`, and
`src/components/admin/`. A primitive is never re-implemented inside a feature folder.

### Primitives

- **Button** — variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`,
  `icon`. Variants differ by border, weight, and background as well as colour, so their
  meaning survives greyscale. `type` is always explicit; icon buttons are 44×44.
  `ButtonLink` renders the same surface on an anchor, because navigation must stay a real
  link; both share `buttonClasses` so they cannot drift.
- **Field** — `TextField`, `TextAreaField`, `SelectField`, `CheckboxField`. Label above,
  help below, error below that, associated with `aria-describedby` and `aria-invalid`.
- **Badge / StatusBadge** — status carries a dot and a text label.
- **Card** — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardBody`, `CardFooter`,
  and `StretchedLink`. The stretched-link pattern keeps one accessible name per card: the
  title is the link and its pseudo-element covers the card without nesting interactive
  elements.
- **Dialog** — native `<dialog>` modal. Focus moves in on open, is trapped, returns to the
  trigger on close, and Escape closes.
- **ConfirmDialog** — destructive confirmation. Names the record and can require the
  record's name to be typed before the confirm button enables. `window.confirm` is never
  used.
- **Dropdown** — action menu. The trigger exposes `aria-haspopup` / `aria-expanded`; the
  menu dismisses on outside pointerdown and Escape, returning focus to the trigger. Items
  are real links or buttons. `Disclosure` is the lighter `<details>` equivalent.
- **Tabs**, **Pagination**, **Alert**, **Skeleton**, **EmptyState / ErrorState /
  NotFoundState**, **Table**.
- **Table** — semantic `<table>` with a `sr-only` caption, `scope` attributes, right-aligned
  numeric columns, and sortable headers as buttons inside `th` with `aria-sort`.

### Reader composites

- **StoryCard**, **FeaturedStory**, **StoryGrid**, **CategoryCard**, **ChapterList**. The
  story card is the single implementation used on home, listings, categories, search, and
  related lists. Covers use `next/image` with explicit dimensions and a fixed aspect ratio.
- **ChapterNav** — previous/next, labelled in words ("Previous chapter") rather than bare
  arrows. It is wired to published siblings only at the call site.
- **RichText** — the single sanctioned renderer for sanitized chapter HTML. No other
  `dangerouslySetInnerHTML` exists in the codebase. **SectionOrnament** is the typographic
  divider between sections.
- **ReadingLayout** — the chapter frame: a quiet utility bar, breadcrumb, the chapter
  heading (one `<h1>`), the prose column, then navigation. Nothing floats over the text.
  `ReadingProgress` is a 2px, non-blocking position indicator.

### Admin composites

- **AdminShell**, **AdminSidebar**, **AdminPageHeader**, **StatGrid / StatCard**,
  **DraftBanner**. On `lg` and up the sidebar is persistent; below that it is a
  keyboard-operable `<details>` drawer, not a hidden column.
- **AdminForm**, **FormSection**, **FormActions**, **EditorFrame**, **ToolbarButton**.
  Layout only — submission, validation, and error mapping belong to Server Actions.
  `EditorFrame` provides the Tiptap chrome; the server remains the sanitization authority.

## 7. States

Loading, empty, and error are three distinct, deliberately designed states. They are never
interchanged.

- **Loading** — skeletons mirror the dimensions of the content they replace, so nothing
  shifts when data arrives. Skeletons exist for `StoryGrid`, `Table`, `ChapterList`, and
  the prose column.
- **Empty** — reader-facing empty states are brief and honest. Admin empty states carry the
  action that fills them ("Create your first story"). A bare "No data" string is never
  rendered.
- **Error** — safe, specific about what to do next, with a retry affordance. No stack
  traces, Prisma messages, bucket keys, or environment values. `ErrorState` and
  `NotFoundState` cover page-level failures and missing public resources.

## 8. Accessibility

The checklist in `.agent/skills/ui-ux/SKILL.md` is the bar. The load-bearing decisions:

- Semantic landmarks and a skip link as the first focusable element.
- Exactly one `<h1>` per reading page; heading levels are never skipped.
- Every interactive element is a real `<button>` or `<a>`. No clickable `<div>`.
- Focus is never removed; `:focus-visible` is defined once in `globals.css` using the
  primary token.
- Dialogs trap focus, close on Escape, and restore focus to the trigger.
- Icon-only controls carry `aria-label`; decorative icons are `aria-hidden`.
- Touch targets are at least 44×44px.
- `prefers-reduced-motion` collapses animation and transition durations.

## 9. Documented deviations and open decisions

- **Author information is intentionally absent.** The `Story` model has no author field, so
  no author byline, avatar, or "by …" line is rendered anywhere. Adding one requires a
  schema decision and a migration first; a layout must not invent schema to satisfy a
  visual.
- **`next/image` `fill` with sized parents.** Cover images use `fill` inside a parent with
  an explicit aspect ratio. This is a deliberate alternative to numeric `width`/`height`
  for covers whose intrinsic dimensions are unknown, and it still prevents layout shift.
- **Admin tables and narrow screens.** Tables are semantic and horizontally scrollable
  inside their container below `md`, with the first column as the row header. A stacked-card
  transformation is deferred to the phase where the real admin data tables are built.
- **`/design-system` is temporary.** It is a review surface, not a route in the product, and
  is deleted when the reader phase lands.
- **Dark mode** is deferred. See section 2.

## 10. Verification

```
npm run typecheck
npm run lint
npm test
npm run build
node scripts/verify-contrast.mjs
```

- `npm test` runs Vitest over `tests/unit/`. The contrast suite imports the same pure
  functions the script uses, so the design tokens are covered by both the gate and the
  standalone check.
- `scripts/verify-contrast.mjs` is the permanent regression check for the colour tokens.
  It reads them from `globals.css`, so it cannot drift from the source of truth, and exits
  non-zero if any pairing falls below WCAG AA.
