/**
 * Design-system preview.
 *
 * Documentation as a rendered surface, so the tokens and primitives in
 * docs/design-system.md can be reviewed against the real thing rather than
 * against a description of it.
 *
 * Not part of the product. Kept as the living reference for the primitives and
 * composites the app renders.
 */
import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  SectionHeading,
  StretchedLink,
} from "@/components/ui/Card";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/Field";
import { Disclosure, Dropdown } from "@/components/ui/Dropdown";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import {
  SkeletonChapterList,
  SkeletonProse,
  SkeletonStoryGrid,
  SkeletonTable,
} from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { SiteFooter } from "@/components/navigation/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { Wordmark } from "@/components/navigation/Wordmark";
import { ChapterNav } from "@/components/chapters/ChapterNav";
import { ChapterList } from "@/components/chapters/ChapterList";
import { CategoryCard } from "@/components/stories/CategoryCard";
import { FeaturedStory, StoryGrid } from "@/components/stories/StoryCard";
import { RichText, SectionOrnament } from "@/components/chapters/RichText";
import { ReadingLayout } from "@/components/chapters/ReadingLayout";
import { ReadingProgress } from "@/components/chapters/ReadingProgress";
import {
  AdminPageHeader,
  AdminShell,
  AdminSidebar,
  DraftBanner,
  StatCard,
  StatGrid,
} from "@/components/admin/AdminShell";
import {
  AdminForm,
  EditorFrame,
  FormActions,
  FormSection,
  ToolbarButton,
} from "@/components/admin/AdminForm";
import type { StoryCardData } from "@/components/stories/StoryCard";
import {
  ConfirmDialogDemo,
  DialogPreview,
  DropdownSelectDemo,
  SortableTableDemo,
} from "./previews";

export const metadata: Metadata = { title: "Design system" };

const SAMPLE_STORY: StoryCardData = {
  slug: "the-salt-road",
  title: "The Salt Road",
  author: "Arujan Vale",
  shortDescription:
    "A cartographer retraces a trade route that vanished from every map, and finds the towns that chose to be forgotten.",
  coverImageUrl: null,
  coverAlt: null,
  category: { name: "Travel", slug: "travel" },
  chapterCount: 12,
  readingMinutes: 48,
  publishedAt: "2026-01-12T09:00:00.000Z",
};

const SAMPLE_STORIES: StoryCardData[] = [
  SAMPLE_STORY,
  { ...SAMPLE_STORY, slug: "nine-lives", title: "Nine Lives of a Borrowed Coat", category: { name: "Fiction", slug: "fiction" }, chapterCount: 3, readingMinutes: 22 },
  { ...SAMPLE_STORY, slug: "the-quiet-ledger", title: "The Quiet Ledger", category: null, chapterCount: null, readingMinutes: null },
  { ...SAMPLE_STORY, slug: "signal-and-noise", title: "Signal and Noise", category: { name: "Essays", slug: "essays" }, chapterCount: 7, readingMinutes: 31 },
  { ...SAMPLE_STORY, slug: "low-tide-almanac", title: "Low Tide Almanac", category: { name: "Nature", slug: "nature" }, chapterCount: 24, readingMinutes: 96 },
  { ...SAMPLE_STORY, slug: "the-inheritance", title: "The Inheritance", category: { name: "Fiction", slug: "fiction" }, chapterCount: 15, readingMinutes: 64 },
];

/*
 * The allowlisted subset a sanitizer would produce. Rendered through the one
 * sanctioned RichText component, never via ad-hoc dangerouslySetInnerHTML.
 */
const READING_HTML = `
  <p>The wind came off the plateau before the cold did, carrying grit fine enough
  to taste. Arujan wrapped the ledger in oilcloth and waited for the light to
  change, because everything he had been told about this country assumed a sun
  that would arrive eventually.</p>
  <p>It did not. By the fourth day the ridge had become a single grey geometry,
  featureless and close, and the survey markers they had left two years ago were
  indistinguishable from the stone they were meant to measure.</p>
  <blockquote>Maps do not record what a place was. They record what someone, on a
  particular day, was willing to claim about it.</blockquote>
  <p>He opened the ledger to the last page he had written in and read back his own
  hand, which had been so certain. The ink was the same colour. It was his
  certainty that had gone out of fashion.</p>
  <ul>
    <li>The marker at the second cairn had been moved.</li>
    <li>The well at Kethran was dry, and had been dry for a season.</li>
    <li>Someone had scratched a date into the cairn&rsquo;s flat face.</li>
  </ul>
  <p>He closed the ledger, and began the descent.</p>
`;

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="font-ui text-body-sm text-ink-muted">{label}</span>
      <span className="font-mono text-body-xs text-ink">{value}</span>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="shell py-10">
          <p className="label-micro text-primary">Design system</p>
          <h1 className="mt-3 font-display text-display-lg text-ink text-balance">
            Eagles Eye visual language
          </h1>
          <p className="mt-4 max-w-2xl font-ui text-body text-ink-muted text-pretty">
            Editorial, calm, built for reading. One serif for prose, one grotesque for
            interface, a paper-warm surface, and borders instead of shadows. No gradients,
            no blur, no tinted icon circles.
          </p>
        </div>
      </header>

      <main id="main" className="shell flex flex-col gap-16 py-14">
        {/* ---------------------------------------------------- Colour -- */}
        <section aria-labelledby="s-colour">
          <SectionHeading title="Colour" eyebrow="Tokens" />
          <h2 id="s-colour" className="sr-only">
            Colour
          </h2>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Paper", "bg-paper border-border"],
                  ["Surface", "bg-surface border-border"],
                  ["Sunken", "bg-surface-sunken border-border"],
                  ["Primary", "bg-primary border-primary"],
                  ["Accent", "bg-accent border-accent"],
                  ["Inverse", "bg-surface-inverse border-surface-inverse"],
                ].map(([name, className]) => (
                  <div
                    key={name}
                    className={`flex h-20 flex-col justify-end rounded-md border p-2.5 ${className}`}
                  >
                    <span
                      className={`font-ui text-body-xs font-medium ${
                        name === "Primary" ||
                        name === "Accent" ||
                        name === "Inverse"
                          ? "text-paper"
                          : "text-ink"
                      }`}
                    >
                      {name}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <Spec label="--color-paper" value="#faf8f5" />
                <Spec label="--color-surface" value="#ffffff" />
                <Spec label="--color-surface-sunken" value="#f2eee7" />
                <Spec label="--color-ink" value="#1a1817" />
                <Spec label="--color-ink-muted" value="#55504a" />
                <Spec label="--color-ink-subtle" value="#6e675e" />
                <Spec label="--color-border" value="#e3ded5" />
                <Spec label="--color-border-strong" value="#8c8378" />
                <Spec label="--color-primary" value="#7c2d26" />
                <Spec label="--color-accent" value="#1f4d4a" />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-heading-sm text-ink">
                  Verified contrast
                </h3>
                <p className="font-ui text-body-sm text-ink-muted text-pretty">
                  Every pairing below was checked by script against WCAG AA, not by eye.
                  Body text needs 4.5:1; large text and control edges need 3:1.
                </p>
              </div>
              <div className="rounded-md border border-border bg-surface p-4">
                <Spec label="ink on paper" value="16.69:1  AAA" />
                <Spec label="ink-muted on paper" value="7.52:1  AAA" />
                <Spec label="ink-subtle on paper" value="5.26:1  AA" />
                <Spec label="on-primary on primary" value="8.76:1  AAA" />
                <Spec label="accent on surface" value="9.47:1  AAA" />
                <Spec label="success on surface" value="6.37:1  AA" />
                <Spec label="warning on surface" value="5.92:1  AA" />
                <Spec label="error on surface" value="7.48:1  AAA" />
                <Spec label="border-strong on paper" value="3.52:1  AA" />
              </div>
              <Alert tone="warning" title="border is decorative only">
                <code className="font-mono text-body-xs">--color-border</code> at 1.26:1
                cannot be the sole edge of an input. Controls use{" "}
                <code className="font-mono text-body-xs">--color-border-strong</code>.
              </Alert>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Typography -- */}
        <section aria-labelledby="s-type">
          <SectionHeading title="Typography" eyebrow="Scale" />
          <h2 id="s-type" className="sr-only">
            Typography
          </h2>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="flex flex-col gap-6">
              <div>
                <p className="label-micro mb-2 text-ink-subtle">
                  Display · Newsreader · fluid
                </p>
                <p className="font-display text-display-xl text-ink text-balance">
                  The Salt Road
                </p>
                <p className="mt-3 font-display text-display-lg text-ink text-balance">
                  Chapter Nine: The Weather Turns
                </p>
                <p className="mt-3 font-display text-display-md text-ink">
                  A cartographer retraces a vanished trade route
                </p>
                <p className="mt-3 font-display text-display-sm text-ink">
                  Headings tighten as they grow
                </p>
              </div>

              <div>
                <p className="label-micro mb-2 text-ink-subtle">
                  Reading prose · 19px / 1.75 · 70ch
                </p>
                <div className="reading-column border-l-2 border-primary pl-5">
                  <p className="text-prose text-ink text-pretty">
                    The road had been gone for four hundred years, and the maps were
                    precise about its absence. Every chart of the province carried the same
                    blank quarter, smoothed into grassland, as though the cartographers had
                    agreed to be polite about it.
                  </p>
                </div>
              </div>

              <div>
                <p className="label-micro mb-2 text-ink-subtle">
                  Interface · Archivo · sans
                </p>
                <p className="font-ui text-body text-ink">
                  Navigation, buttons, labels and table cells use the grotesque.
                </p>
                <p className="font-ui text-body-sm text-ink-muted">
                  Supporting copy stays at 14px muted.
                </p>
                <p className="font-ui text-body-xs text-ink-subtle tabular-nums">
                  Metadata, counts and timestamps: 13px, tabular numerals.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-surface p-5">
              <p className="label-micro mb-3 text-ink-subtle">Role contract</p>
              <Spec label="Display" value="serif · -0.022em" />
              <Spec label="Heading" value="serif · -0.01em" />
              <Spec label="Body (read)" value="serif · 19px / 1.75" />
              <Spec label="Body (UI)" value="sans · 16px / 1.6" />
              <Spec label="Metadata" value="sans · 13px · tabular" />
              <Spec label="Micro label" value="sans · 12px · 0.08em upper" />
              <Spec label="Button" value="sans · 14px / 500" />
              <Spec label="Navigation" value="sans · 14px / 500" />
              <Spec label="Code" value="mono · system stack" />
              <Spec label="Max measure" value="70ch" />
              <Spec label="Base grid" value="4px" />
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- Buttons -- */}
        <section aria-labelledby="s-buttons">
          <SectionHeading title="Buttons" eyebrow="Controls" />
          <h2 id="s-buttons" className="sr-only">
            Buttons
          </h2>

          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>
                Four intents, distinguished by background, border and weight together, so
                the hierarchy survives greyscale.
              </CardDescription>
            </CardHeader>
            <CardBody className="flex flex-col gap-5">
              <Row>
                <Button variant="primary">Primary action</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="subtle">Subtle</Button>
                <Button variant="danger">Delete</Button>
              </Row>
              <Row>
                <Button size="sm" variant="secondary">
                  Small
                </Button>
                <Button size="md" variant="secondary">
                  Medium
                </Button>
                <Button size="lg" variant="secondary">
                  Large
                </Button>
              </Row>
              <Row>
                <Button variant="primary" loading>
                  Saving
                </Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
                <Button size="icon" variant="ghost" aria-label="More options">
                  <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.4" />
                    <circle cx="8" cy="8" r="1.4" />
                    <circle cx="8" cy="13" r="1.4" />
                  </svg>
                </Button>
              </Row>
            </CardBody>
          </Card>
        </section>

        {/* -------------------------------------------------------- Forms -- */}
        <section aria-labelledby="s-forms">
          <SectionHeading title="Forms" eyebrow="Inputs" />
          <h2 id="s-forms" className="sr-only">
            Forms
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Default</CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-5">
                <TextField label="Title" placeholder="The Salt Road" required />
                <TextField
                  label="Slug"
                  hint="Generated from the title. Changing it after publication breaks links."
                  defaultValue="the-salt-road"
                />
                <SelectField
                  label="Category"
                  placeholder="Choose a category"
                  options={[
                    { value: "fiction", label: "Fiction" },
                    { value: "travel", label: "Travel" },
                    { value: "essays", label: "Essays" },
                  ]}
                  defaultValue="travel"
                />
                <TextAreaField
                  label="Excerpt"
                  hint="Shown on cards and used for the meta description."
                  defaultValue="A cartographer retraces a trade route that vanished from every map."
                />
                <CheckboxField
                  label="Feature on the home page"
                  hint="At most one story is featured at a time."
                />
              </CardBody>
            </Card>

            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Error and help states</CardTitle>
                  <CardDescription>
                    The error is inline, associated by aria-describedby, and announced.
                  </CardDescription>
                </CardHeader>
                <CardBody className="flex flex-col gap-5">
                  <TextField
                    label="Email"
                    error="Enter a valid email address."
                    defaultValue="not-an-email"
                    required
                  />
                  <TextField
                    label="Password"
                    hint="At least 12 characters."
                    type="password"
                    error="Passwords do not match."
                    required
                  />
                  <SelectField
                    label="Status"
                    error="Select a status before publishing."
                    options={[
                      { value: "DRAFT", label: "Draft" },
                      { value: "PUBLISHED", label: "Published" },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Alerts</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-3">
                  <Alert tone="info" title="Draft saved">
                    Changes are stored but not visible to readers.
                  </Alert>
                  <Alert tone="success" title="Story published">
                    It is now live in listings and the sitemap.
                  </Alert>
                  <Alert tone="warning" title="Cover image is large">
                    A 5 MB upload may be rejected on slow connections.
                  </Alert>
                  <Alert tone="error" title="Could not publish">
                    The story is still a draft. Try again.
                  </Alert>
                </CardBody>
              </Card>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Badges etc -- */}
        <section aria-labelledby="s-feedback">
          <SectionHeading title="Badges, tabs and menus" eyebrow="Feedback" />
          <h2 id="s-feedback" className="sr-only">
            Badges, tabs and menus
          </h2>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Status badges</CardTitle>
                <CardDescription>
                  Status carries a text label and a dot. Colour is never the only signal.
                </CardDescription>
              </CardHeader>
              <CardBody>
                <Row>
                  <StatusBadge status="DRAFT" />
                  <StatusBadge status="PUBLISHED" />
                  <StatusBadge status="ARCHIVED" />
                  <Badge tone="primary">Primary</Badge>
                  <Badge tone="accent">Accent</Badge>
                  <Badge tone="neutral">Neutral</Badge>
                  <Badge tone="success" dot>Success</Badge>
                  <Badge tone="warning" dot>Warning</Badge>
                  <Badge tone="error" dot>Error</Badge>
                </Row>
              </CardBody>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Tabs</CardTitle>
                  <CardDescription>
                    Arrow keys move focus, Enter activates. Manual, not automatic.
                  </CardDescription>
                </CardHeader>
                <CardBody>
                  <Tabs
                    label="Story sections"
                    defaultTab="outline"
                    items={[
                      { id: "outline", label: "Outline", content: <p className="font-ui text-body-sm text-ink-muted">Twelve chapters, listed in order.</p> },
                      { id: "settings", label: "Settings", content: <p className="font-ui text-body-sm text-ink-muted">Slug, category, cover.</p> },
                      { id: "seo", label: "SEO", content: <p className="font-ui text-body-sm text-ink-muted">Derived from the short description.</p> },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Action menu</CardTitle>
                  <CardDescription>
                    Built on the native Popover API, so light-dismiss and Escape are the
                    browser&apos;s job.
                  </CardDescription>
                </CardHeader>
                <CardBody className="flex flex-col gap-5">
                  <Row>
                    <Dropdown
                      label="Story actions"
                      variant="button"
                      items={[
                        { label: "Edit story", href: "/admin/stories/the-salt-road" },
                        { label: "Manage chapters", href: "/admin/stories/the-salt-road/chapters" },
                        { label: "Move to draft", href: "/admin/stories/the-salt-road/status" },
                        {
                          label: "Delete story",
                          href: "/admin/stories/the-salt-road/delete",
                          destructive: true,
                        },
                      ]}
                    />
                    <Dropdown
                      label="Unavailable actions"
                      variant="button"
                      items={[
                        { label: "Restore revision", disabled: true },
                        { label: "Transfer ownership", disabled: true },
                      ]}
                    />
                  </Row>
                  <Row>
                    <DropdownSelectDemo />
                  </Row>
                  <Disclosure summary="Publishing rules">
                    <p className="max-w-md font-ui text-body-sm text-ink-muted text-pretty">
                      A story is public only when it and at least one of its
                      chapters are published. Unpublishing either removes it from
                      every public surface at once.
                    </p>
                  </Disclosure>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Destructive confirmation</CardTitle>
                <CardDescription>
                  Names the record, states the consequences, and can demand a typed
                  phrase.
                </CardDescription>
              </CardHeader>
              <CardBody>
                <Row>
                  <DialogPreview />
                  <ConfirmDialogDemo />
                </Row>
              </CardBody>
            </Card>
          </div>
        </section>

        {/* ----------------------------------------------------- Cards -- */}
        <section aria-labelledby="s-cards">
          <SectionHeading title="Card composition" eyebrow="Primitives" />
          <h2 id="s-cards" className="sr-only">
            Card composition
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <Card variant="raised">
              <CardHeader>
                <CardTitle>Raised card</CardTitle>
                <CardDescription>
                  Border plus a soft shadow, for a panel that sits above the page.
                </CardDescription>
              </CardHeader>
              <CardBody>
                <p className="font-ui text-body-sm text-ink-muted">
                  Flat cards use a transparent border so layout is identical
                  whether or not the card is raised.
                </p>
              </CardBody>
              <CardFooter>
                <StretchedLink href="/stories/the-salt-road" className="font-ui text-body-sm font-medium text-accent">
                  Open the story
                </StretchedLink>
                <span className="font-ui text-body-xs text-ink-subtle">
                  Stretched link covers the whole card
                </span>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Flat card</CardTitle>
                <CardDescription>
                  The default. Borders carry separation; shadow is reserved for
                  genuinely floating surfaces.
                </CardDescription>
              </CardHeader>
              <CardBody>
                <dl className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="font-ui text-body-sm text-ink-muted">Radius</dt>
                    <dd className="font-mono text-body-xs text-ink">5px</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="font-ui text-body-sm text-ink-muted">Border</dt>
                    <dd className="font-mono text-body-xs text-ink">--color-border</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------ Story cards -- */}
        <section aria-labelledby="s-story">
          <SectionHeading title="Story surfaces" eyebrow="Reader" />
          <h2 id="s-story" className="sr-only">
            Story surfaces
          </h2>

          <div className="flex flex-col gap-10">
            <Breadcrumbs
              items={[
                { label: "Stories", href: "/stories" },
                { label: "Travel", href: "/categories/travel" },
                { label: "The Salt Road" },
              ]}
            />

            <StoryGrid stories={SAMPLE_STORIES} priorityCount={1} />

            <div>
              <h3 className="mb-4 font-display text-heading-sm text-ink">
                Category index
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <CategoryCard
                  category={{ name: "Fiction", slug: "fiction", description: "Short and long form." }}
                  storyCount={18}
                />
                <CategoryCard
                  category={{ name: "Travel", slug: "travel", description: "Journeys, on foot and otherwise." }}
                  storyCount={7}
                />
                <CategoryCard
                  category={{ name: "Essays", slug: "essays", description: null }}
                  storyCount={12}
                />
              </div>
            </div>

            <div>
              <h3 className="mb-4 font-display text-heading-sm text-ink">
                Compact row, used for related and adjacent lists
              </h3>
              <ul className="flex flex-col gap-5">
                {SAMPLE_STORIES.slice(0, 3).map((story) => (
                  <li key={story.slug} className="flex">
                    <div className="w-full">
                      {/* Row layout */}
                      <StoryRow story={story} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <Pagination
              page={3}
              pageCount={12}
              totalItems={237}
              pageSize={20}
              buildHref={(page) => `/stories?page=${page}`}
              itemNoun="story"
            />
          </div>
        </section>

        {/* ----------------------------------------------- Reading chrome -- */}
        <section aria-labelledby="s-reading">
          <SectionHeading title="Reading interface" eyebrow="Chapter" />
          <h2 id="s-reading" className="sr-only">
            Reading interface
          </h2>

          <ReadingLayout
            titleAs="h2"
            utilityBar={
              <div className="border-y border-border bg-surface-sunken px-5 py-2 text-center font-ui text-body-xs text-ink-muted">
                Utility bar: story title, and a quiet return link. No overlays, no
                floating controls.
              </div>
            }
            breadcrumbs={[
              { label: "Stories", href: "/stories" },
              { label: "The Salt Road", href: "/stories/the-salt-road" },
              { label: "Chapter Nine" },
            ]}
            chapterTitle="Chapter Nine: The Weather Turns"
            chapterMeta={
              <>
                <span>Chapter 9 of 12</span>
                <span aria-hidden="true">·</span>
                <span>7 min read</span>
              </>
            }
            footer={
              <div className="reading-column">
                <ChapterNav
                  previous={{
                    slug: "the-weather-turns-8",
                    title: "A Ledger Kept in Oilcloth",
                  }}
                  next={{ slug: "the-weather-turns-10", title: "The Date in the Stone" }}
                  currentNumber={9}
                  totalCount={12}
                  storySlug="the-salt-road"
                  storyTitle="The Salt Road"
                />
              </div>
            }
          >
            <div className="reading-column">
              <RichText html={READING_HTML} />
              <SectionOrnament label="End of chapter nine" />
            </div>
          </ReadingLayout>

          <div className="rounded-md border border-border bg-surface p-5">
            <p className="label-micro mb-3 text-ink-subtle">
              Reading progress — inert here, driven by scroll on a real chapter
            </p>
            <div className="relative h-24 overflow-hidden rounded-sm border border-border bg-paper">
              <ReadingProgress />
            </div>
          </div>
        </section>

        {/* ------------------------------------------- Featured + chapters -- */}
        <section aria-labelledby="s-featured">
          <SectionHeading title="Featured story and chapter list" eyebrow="Reader" />
          <h2 id="s-featured" className="sr-only">
            Featured story and chapter list
          </h2>

          <div className="flex flex-col gap-10">
            <FeaturedStory story={SAMPLE_STORIES[0]!} eyebrow="Featured this week" />

            <div className="max-w-2xl">
              <ChapterList
                storySlug="the-salt-road"
                chapters={[
                  { slug: "the-oilcloth", title: "A Ledger Kept in Oilcloth", number: 1, readingMinutes: 6, isCurrent: false },
                  { slug: "the-cairn", title: "The Cairn at Kethran", number: 2, readingMinutes: 5, isCurrent: false },
                  { slug: "the-weather-turns", title: "The Weather Turns", number: 3, readingMinutes: 7, isCurrent: true },
                  { slug: "the-date-in-stone", title: "The Date in the Stone", number: 4, readingMinutes: null, isCurrent: false },
                ]}
              />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- Site chrome -- */}
        <section aria-labelledby="s-chrome">
          <SectionHeading title="Site chrome" eyebrow="Layout" />
          <h2 id="s-chrome" className="sr-only">
            Site chrome
          </h2>

          <div className="flex flex-col gap-6">
            <SiteHeader
              navLabel="Preview navigation"
              brand={<Wordmark href="#" />}
              nav={[
                { label: "Stories", href: "#", current: true },
                { label: "Categories", href: "#" },
                { label: "Search", href: "#" },
              ]}
            />
            <p className="font-ui text-body-sm text-ink-muted text-pretty">
              The header is sticky and borderless at rest. On narrow screens the
              destinations collapse into a native disclosure; on lg they are inline.
              The wordmark is the brand slot. The footer carries real category and
              about links in the product, never invented ones.
            </p>
            <SiteFooter
              note="Preview footer. In the product this is built from real categories and about pages."
              sections={[
                {
                  heading: "Browse",
                  links: [
                    { label: "All stories", href: "#" },
                    { label: "Categories", href: "#" },
                  ],
                },
                {
                  heading: "About",
                  links: [
                    { label: "About Eagles Eye", href: "#" },
                    { label: "Contact", href: "#" },
                  ],
                },
              ]}
            />
          </div>
        </section>

        {/* ------------------------------------------------------- Admin -- */}
        <section aria-labelledby="s-admin">
          <SectionHeading title="Admin" eyebrow="Operator surface" />
          <h2 id="s-admin" className="sr-only">
            Admin
          </h2>

          <div className="flex flex-col gap-6">
            <AdminPageHeader
              title="Stories"
              description="Every story in the catalogue, newest first. Drafts and archived entries are visible here and nowhere else."
              actions={
                <>
                  <Button variant="secondary">Export</Button>
                  <Button variant="primary">New story</Button>
                </>
              }
            />

            <StatGrid>
              <StatCard label="Published" value={137} hint="Live in listings" />
              <StatCard label="Drafts" value={12} hint="Awaiting publication" />
              <StatCard label="Archived" value={8} hint="Hidden from readers" />
              <StatCard label="Chapters" value={1184} hint="Across all stories" />
            </StatGrid>

            <Table caption="Stories, with status, category and chapter count">
              <TableHead>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell align="right">Chapters</TableHeaderCell>
                <TableHeaderCell align="right">Published</TableHeaderCell>
              </TableHead>
              <TableBody>
                {SAMPLE_STORIES.map((story, index) => (
                  <TableRow key={story.slug}>
                    <TableCell header>{story.title}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={
                          (["PUBLISHED", "DRAFT", "PUBLISHED", "ARCHIVED", "PUBLISHED"] as const)[index] ?? "DRAFT"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {story.category?.name ?? "—"}
                    </TableCell>
                    <TableCell align="right">{story.chapterCount ?? 0}</TableCell>
                    <TableCell align="right" className="text-ink-muted">
                      {index === 0 ? "4 Mar" : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <SkeletonTable rows={4} columns={4} />

            <div>
              <p className="label-micro mb-3 text-ink-subtle">
                Sortable table — click a sortable column header
              </p>
              <SortableTableDemo />
            </div>
          </div>
        </section>

        {/* -------------------------------------------- Admin shell + form -- */}
        <section aria-labelledby="s-admin-shell">
          <SectionHeading title="Admin shell and form" eyebrow="Operator surface" />
          <h2 id="s-admin-shell" className="sr-only">
            Admin shell and form
          </h2>

          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-md border border-border">
              <DraftBanner status="DRAFT" href="/admin/stories/the-salt-road" />
              <AdminShell
                header={
                  <div className="border-b border-border bg-surface px-5 py-4">
                    <p className="font-ui text-body-sm text-ink-muted">
                      Route header slot. On narrow screens the sidebar above is a
                      keyboard-reachable disclosure drawer, not a hidden column.
                    </p>
                  </div>
                }
                sidebar={
                  <AdminSidebar
                    brand={
                      <span className="font-display text-heading-sm font-semibold text-ink">
                        Eagles Eye
                      </span>
                    }
                    sections={[
                      {
                        heading: "Catalogue",
                        items: [
                          { label: "Stories", href: "/admin/stories", current: true },
                          { label: "Categories", href: "/admin/categories" },
                          { label: "Tags", href: "/admin/tags" },
                        ],
                      },
                      {
                        heading: "Account",
                        items: [{ label: "Sign out", href: "/logout" }],
                      },
                    ]}
                    footer={
                      <p className="font-ui text-body-xs text-ink-subtle">
                        Signed in as admin
                      </p>
                    }
                  />
                }
              >
                <p className="font-ui text-body-sm text-ink-muted">
                  Main content region. The shell renders the frame only; route
                  protection lives in the admin layout guard.
                </p>
              </AdminShell>
            </div>

            <div className="rounded-md border border-border bg-surface p-5">
              <AdminForm
                footer={
                  <FormActions
                    submitLabel="Publish story"
                    cancel={<Button variant="ghost">Cancel</Button>}
                    destructive={
                      <Button variant="danger" size="sm">
                        Delete story
                      </Button>
                    }
                  />
                }
              >
                <FormSection
                  title="Story details"
                  description="One column, label above control. Errors appear inline, associated with the field."
                >
                  <TextField label="Title" defaultValue="The Salt Road" required />
                  <TextField label="Slug" defaultValue="the-salt-road" />
                </FormSection>
                <FormSection title="Editor">
                  <EditorFrame
                    toolbar={
                      <>
                        <ToolbarButton label="Bold">
                          <span className="font-semibold">B</span>
                        </ToolbarButton>
                        <ToolbarButton label="Italic">
                          <span className="italic">I</span>
                        </ToolbarButton>
                        <ToolbarButton label="Insert link" active>
                          <span aria-hidden="true">↗</span>
                        </ToolbarButton>
                      </>
                    }
                  >
                    <p>
                      The editor mounts here. The server sanitizes the HTML on
                      write; this frame only provides the chrome.
                    </p>
                  </EditorFrame>
                </FormSection>
              </AdminForm>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ States -- */}
        <section aria-labelledby="s-states">
          <SectionHeading title="States" eyebrow="Loading, empty, error" />
          <h2 id="s-states" className="sr-only">
            States
          </h2>

          <div className="flex flex-col gap-6">
            <div>
              <p className="label-micro mb-3 text-ink-subtle">
                Loading — mirrors the card it replaces, so nothing shifts
              </p>
              <SkeletonStoryGrid count={3} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="label-micro mb-3 text-ink-subtle">
                  Loading a chapter list
                </p>
                <SkeletonChapterList count={4} />
              </div>
              <div>
                <p className="label-micro mb-3 text-ink-subtle">
                  Loading the prose column
                </p>
                <SkeletonProse />
              </div>
            </div>

            <div>
              <p className="label-micro mb-3 text-ink-subtle">
                Empty, reader-facing
              </p>
              <EmptyState
                title="No stories here yet"
                description="Nothing has been published in this category. Browse the full catalogue in the meantime."
              />
            </div>

            <div>
              <p className="label-micro mb-3 text-ink-subtle">
                Empty, admin — carries the action that fixes it
              </p>
              <EmptyState
                tone="admin"
                title="No stories yet"
                description="Create your first story, save it as a draft, then publish when it is ready."
                action={
                  <Button variant="primary" size="sm">
                    Create your first story
                  </Button>
                }
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ErrorState
                action={
                  <Button variant="secondary" size="sm">
                    Try again
                  </Button>
                }
              />
              <NotFoundState />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- Spacing -- */}
        <section aria-labelledby="s-spacing">
          <SectionHeading title="Spacing" eyebrow="4px base" />
          <h2 id="s-spacing" className="sr-only">
            Spacing
          </h2>
          <div className="rounded-md border border-border bg-surface p-5">
            <Spec label="Within a component" value="4 · 8 · 12" />
            <Spec label="Between siblings" value="16 · 24" />
            <Spec label="Between components" value="32 · 48" />
            <Spec label="Between sections" value="80 (--spacing-section)" />
            <Spec label="Page top and bottom" value="96–120" />
            <Spec label="Page gutter, mobile" value="24" />
            <Spec label="Page gutter, lg up" value="40" />
            <Spec label="Content max width" value="1200" />
            <Spec label="Admin max width" value="1344" />
            <Spec label="Reading column" value="700 (70ch)" />
          </div>
        </section>
      </main>

      <footer className="mt-(--spacing-section) border-t border-border">
        <div className="shell flex flex-col gap-2 py-10">
          <p className="font-display text-heading-sm text-ink">Eagles Eye</p>
          <p className="font-ui text-body-xs text-ink-muted">
            Design system preview. Documented in docs/design-system.md.
          </p>
        </div>
      </footer>
    </>
  );
}

function StoryRow({ story }: { story: StoryCardData }) {
  return (
    <article className="flex gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-surface-sunken">
        <span className="absolute inset-0 grid place-items-center font-display text-display-sm text-border-strong">
          {story.title.charAt(0)}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {story.category ? <Badge tone="primary">{story.category.name}</Badge> : null}
        <h4 className="font-display text-heading-xs text-ink">{story.title}</h4>
        <p className="line-clamp-2 font-ui text-body-sm text-ink-muted text-pretty">
          {story.shortDescription}
        </p>
      </div>
    </article>
  );
}

