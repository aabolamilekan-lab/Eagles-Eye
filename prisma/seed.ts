import { ContentStatus, PrismaClient, UserRole } from "@prisma/client";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

/**
 * Development seed.
 *
 * Fictional content plus one development administrator. The admin credential is
 * read from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, never hardcoded, and the
 * password is stored only as an Argon2id hash. It refuses to run in production
 * or against a non-local database host before it touches the database.
 *
 * Re-running is idempotent: categories, tags, stories and chapters upsert on
 * their unique keys, and the analytics rows for the seeded stories are replaced.
 */
const prisma = new PrismaClient();

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
  "postgres",
  "db",
  "database",
]);

function abort(message: string): never {
  process.stderr.write(`Seed aborted: ${message}\n`);
  process.exit(1);
}

function assertSafeEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    abort("refusing to run with NODE_ENV=production.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    abort("DATABASE_URL is not set.");
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    abort("DATABASE_URL is not a valid URL.");
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    abort(`refusing to seed a non-local database host (${parsed.hostname}).`);
  }
}

interface SeedChapter {
  chapterNumber: number;
  slug: string;
  title: string;
  content: string;
  status: ContentStatus;
  views: number;
  publishedAt: Date | null;
}

interface SeedStory {
  slug: string;
  title: string;
  author: string;
  shortDescription: string;
  description: string;
  status: ContentStatus;
  featured: boolean;
  views: number;
  categorySlug: string | null;
  tagSlugs: string[];
  publishedAt: Date | null;
  chapters: SeedChapter[];
}

const categories = [
  {
    slug: "frontier-chronicles",
    name: "Frontier Chronicles",
    description: "Stories told from the edges of the map.",
    image: null,
  },
  {
    slug: "quiet-machines",
    name: "Quiet Machines",
    description: "Speculative fiction about the tools we build.",
    image: null,
  },
  {
    slug: "roots-and-rivers",
    name: "Roots and Rivers",
    description: "Place, memory, and the people who stay.",
    image: null,
  },
] as const;

const tags = [
  { slug: "adventure", name: "Adventure" },
  { slug: "mystery", name: "Mystery" },
  { slug: "science-fiction", name: "Science Fiction" },
  { slug: "historical", name: "Historical" },
  { slug: "short-story", name: "Short Story" },
] as const;

const seedStories: SeedStory[] = [
  {
    slug: "the-cartographers-debt",
    title: "The Cartographer's Debt",
    author: "Imani Okafor",
    shortDescription: "A mapmaker trades a coastline for a memory she cannot keep.",
    description:
      "<p>Every map is a promise. Imani Okafor's debut follows a mapmaker who agrees to chart a coast that refuses to hold still, and the debt she owes the town that paid for it.</p><p>Part travelogue, part ghost story, it asks what we owe the places we describe.</p>",
    status: ContentStatus.PUBLISHED,
    featured: true,
    views: 128,
    categorySlug: "frontier-chronicles",
    tagSlugs: ["adventure", "mystery"],
    publishedAt: new Date("2026-01-12T09:00:00.000Z"),
    chapters: [
      {
        chapterNumber: 1,
        slug: "the-commission",
        title: "The Commission",
        content:
          "<p>The harbourmaster unrolled the chart and laid a stone on each corner. \"Every captain who has tried,\" she said, \"has come back with a different coast.\"</p><p>I took the commission anyway. That is the first thing you should know about me.</p>",
        status: ContentStatus.PUBLISHED,
        views: 96,
        publishedAt: new Date("2026-01-12T09:05:00.000Z"),
      },
      {
        chapterNumber: 2,
        slug: "a-coast-that-moves",
        title: "A Coast That Moves",
        content:
          "<p>By the third week the ink on my survey lines had begun to drift, the way frost creeps across a window.</p><blockquote><p>The sea does not care what you draw. The land cares even less.</p></blockquote>",
        status: ContentStatus.PUBLISHED,
        views: 71,
        publishedAt: new Date("2026-01-19T09:00:00.000Z"),
      },
      {
        chapterNumber: 3,
        slug: "what-the-town-is-owed",
        title: "What the Town Is Owed",
        content:
          "<p>They wanted a map they could trust. I gave them one, and paid for it with the only thing I had left to give.</p>",
        status: ContentStatus.PUBLISHED,
        views: 54,
        publishedAt: new Date("2026-01-26T09:00:00.000Z"),
      },
    ],
  },
  {
    slug: "signal-from-kestrel-station",
    title: "Signal From Kestrel Station",
    author: "Tomas Vela",
    shortDescription: "The last relay operator keeps answering a message that stopped being sent years ago.",
    description:
      "<p>Kestrel Station was decommissioned a decade ago. Its relay still listens, and some nights it still replies.</p>",
    status: ContentStatus.PUBLISHED,
    featured: false,
    views: 87,
    categorySlug: "quiet-machines",
    tagSlugs: ["science-fiction", "short-story"],
    publishedAt: new Date("2026-02-03T12:00:00.000Z"),
    chapters: [
      {
        chapterNumber: 1,
        slug: "the-relay",
        title: "The Relay",
        content:
          "<p>The console lit at 03:14, as it always did. No one had sent anything for nine years, but the buffer filled itself anyway.</p>",
        status: ContentStatus.PUBLISHED,
        views: 63,
        publishedAt: new Date("2026-02-03T12:05:00.000Z"),
      },
      {
        chapterNumber: 2,
        slug: "the-reply",
        title: "The Reply",
        content:
          "<p>I typed the only thing left to type: <em>still listening</em>. The relay took a long time to decide.</p>",
        status: ContentStatus.PUBLISHED,
        views: 48,
        publishedAt: new Date("2026-02-10T12:00:00.000Z"),
      },
    ],
  },
  {
    slug: "salt-and-cedar",
    title: "Salt and Cedar",
    author: "Marta Lindqvist",
    shortDescription: "A shipwright's daughter keeps a ledger of every boat her family let go.",
    description:
      "<p>A quiet draft about inheritance, tide tables, and the arithmetic of leaving.</p>",
    status: ContentStatus.DRAFT,
    featured: false,
    views: 0,
    categorySlug: "roots-and-rivers",
    tagSlugs: ["historical"],
    publishedAt: null,
    chapters: [
      {
        chapterNumber: 1,
        slug: "the-ledger",
        title: "The Ledger",
        content: "<p>My father wrote down every hull he finished and every one he sold. I write down the ones we kept.</p>",
        status: ContentStatus.DRAFT,
        views: 0,
        publishedAt: null,
      },
    ],
  },
  {
    slug: "the-lantern-keeper",
    title: "The Lantern Keeper",
    author: "Imani Okafor",
    shortDescription: "An archived tale of the last keeper to trim a working lighthouse.",
    description:
      "<p>Retired from the public catalogue, retained for the record.</p>",
    status: ContentStatus.ARCHIVED,
    featured: false,
    views: 34,
    categorySlug: "roots-and-rivers",
    tagSlugs: ["historical", "mystery"],
    publishedAt: new Date("2025-11-08T18:00:00.000Z"),
    chapters: [
      {
        chapterNumber: 1,
        slug: "the-lamp",
        title: "The Lamp",
        content: "<p>She trimmed the wick the way her mother had, and her mother before that, long after the ships stopped coming.</p>",
        status: ContentStatus.PUBLISHED,
        views: 29,
        publishedAt: new Date("2025-11-08T18:05:00.000Z"),
      },
      {
        chapterNumber: 2,
        slug: "the-dark-year",
        title: "The Dark Year",
        content: "<p>Unfinished. The keeper's second year was never written down.</p>",
        status: ContentStatus.DRAFT,
        views: 0,
        publishedAt: null,
      },
    ],
  },
  {
    slug: "paper-boats-to-anywhere",
    title: "Paper Boats to Anywhere",
    author: "Tomas Vela",
    shortDescription: "Two siblings race their folded boats down a rain-swollen street.",
    description:
      "<p>A short, bright story about a rainy afternoon and the geography of a single block.</p>",
    status: ContentStatus.PUBLISHED,
    featured: false,
    views: 56,
    categorySlug: "roots-and-rivers",
    tagSlugs: ["short-story", "adventure"],
    publishedAt: new Date("2026-03-01T08:00:00.000Z"),
    chapters: [
      {
        chapterNumber: 1,
        slug: "after-the-rain",
        title: "After the Rain",
        content:
          "<p>The gutter ran like a river, and we named it before we launched the first boat.</p>",
        status: ContentStatus.PUBLISHED,
        views: 41,
        publishedAt: new Date("2026-03-01T08:05:00.000Z"),
      },
      {
        chapterNumber: 2,
        slug: "the-long-way-home",
        title: "The Long Way Home",
        content:
          "<p>Every boat reached the drain at the end of the block. None of them came back, which we decided was the point.</p>",
        status: ContentStatus.PUBLISHED,
        views: 30,
        publishedAt: new Date("2026-03-08T08:00:00.000Z"),
      },
    ],
  },
];

async function seedAdministrator(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email) {
    abort("SEED_ADMIN_EMAIL is not set (required for the development admin).");
  }
  if (!password) {
    abort("SEED_ADMIN_PASSWORD is not set (required for the development admin).");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (!existing) {
    const passwordHash = await hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        name: "Development Admin",
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: { id: true },
    });
    return;
  }

  const { valid } = await verifyPassword(existing.passwordHash, password);
  if (!valid) {
    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
      select: { id: true },
    });
    // Changing a password invalidates every other session for that user.
    await prisma.session.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

async function seed(): Promise<void> {
  assertSafeEnvironment();

  await seedAdministrator();

  const categoryIdBySlug = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        image: category.image,
      },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        image: category.image,
      },
      select: { id: true, slug: true },
    });
    categoryIdBySlug.set(row.slug, row.id);
  }

  const tagIdBySlug = new Map<string, string>();
  for (const tag of tags) {
    const row = await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: { slug: tag.slug, name: tag.name },
      select: { id: true, slug: true },
    });
    tagIdBySlug.set(row.slug, row.id);
  }

  for (const story of seedStories) {
    const categoryId =
      story.categorySlug !== null ? categoryIdBySlug.get(story.categorySlug) ?? null : null;

    const row = await prisma.story.upsert({
      where: { slug: story.slug },
      update: {
        title: story.title,
        author: story.author,
        shortDescription: story.shortDescription,
        description: story.description,
        status: story.status,
        featured: story.featured,
        views: story.views,
        categoryId,
        publishedAt: story.publishedAt,
      },
      create: {
        slug: story.slug,
        title: story.title,
        author: story.author,
        shortDescription: story.shortDescription,
        description: story.description,
        status: story.status,
        featured: story.featured,
        views: story.views,
        categoryId,
        publishedAt: story.publishedAt,
      },
      select: { id: true },
    });

    await prisma.storyTag.deleteMany({ where: { storyId: row.id } });
    const tagIds = story.tagSlugs
      .map((slug) => tagIdBySlug.get(slug))
      .filter((id): id is string => id !== undefined);
    if (tagIds.length > 0) {
      await prisma.storyTag.createMany({
        data: tagIds.map((tagId) => ({ storyId: row.id, tagId })),
        skipDuplicates: true,
      });
    }

    for (const chapter of story.chapters) {
      await prisma.chapter.upsert({
        where: { storyId_slug: { storyId: row.id, slug: chapter.slug } },
        update: {
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          content: chapter.content,
          status: chapter.status,
          views: chapter.views,
          publishedAt: chapter.publishedAt,
        },
        create: {
          storyId: row.id,
          chapterNumber: chapter.chapterNumber,
          slug: chapter.slug,
          title: chapter.title,
          content: chapter.content,
          status: chapter.status,
          views: chapter.views,
          publishedAt: chapter.publishedAt,
        },
        select: { id: true },
      });
    }

    await prisma.storyView.deleteMany({ where: { storyId: row.id } });
    await prisma.storyView.createMany({
      data: [
        {
          storyId: row.id,
          sessionId: "seed-session-alpha",
          viewedAt: new Date("2026-02-01T10:00:00.000Z"),
        },
        {
          storyId: row.id,
          sessionId: "seed-session-beta",
          viewedAt: new Date("2026-02-02T11:30:00.000Z"),
        },
      ],
    });
  }

  process.stderr.write("Seed complete.\n");
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write(`Seed failed: ${message}\n`);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
