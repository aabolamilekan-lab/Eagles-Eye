import { NewsFeedType, PrismaClient } from "@prisma/client";

/**
 * Production-Safe News Source and Category Bootstrap.
 *
 * Provides a dedicated, idempotent, and auditable procedure for provisioning the initial
 * news categories and provisional news sources across deployed and local environments.
 *
 * Core Guarantees:
 * 1. Explicit Confirmation: Requires --confirm=production-bootstrap in production,
 *    or --confirm=bootstrap / --confirm=local-bootstrap in non-production.
 * 2. Preflight Conflict Detection: Validates and checks for slug and feedUrl collisions before
 *    performing writes. Aborts immediately if conflicting definitions exist.
 * 3. Atomic Multi-Record Writes: Operates within database transactions.
 * 4. Idempotency: Re-running will not create duplicates or overwrite modified operational settings.
 * 5. Telemetry Preservation: Never touches isActive, consecutiveFailures, lastFetchedAt,
 *    lastSuccessAt, lastErrorAt, lastErrorMessage, etag, or lastModified on existing sources.
 * 6. Provisional Source Safety: New provisional sources are seeded with isActive = false so
 *    they remain dormant until explicitly reviewed and activated by an administrator.
 * 7. Zero Secret Exposure: Never prints credentials, tokens, or connection strings.
 */

export interface BootstrapCategoryDefinition {
  name: string;
  slug: string;
  description: string;
}

export interface BootstrapSourceDefinition {
  name: string;
  slug: string;
  feedUrl: string;
  feedType: NewsFeedType;
  categorySlug: string;
  pollIntervalMinutes: number;
  attributionPolicy: string;
  isProvisional?: boolean;
}

export interface ParsedBootstrapArgs {
  confirm: string | null;
  dryRun: boolean;
}

export type ResolveBootstrapResult =
  | { ok: true; options: { isProduction: boolean; dryRun: boolean } }
  | { ok: false; reason: string };

export interface BootstrapExecutionResult {
  dryRun: boolean;
  categoriesUpserted: number;
  sourcesCreated: number;
  sourcesUpdated: number;
  sourcesUnchanged: number;
}

export const BOOTSTRAP_CATEGORIES: readonly BootstrapCategoryDefinition[] = [
  {
    name: "Nigerian Affairs",
    slug: "nigerian-affairs",
    description: "Verified coverage of governance, civil society, civic policy, and public affairs across Nigeria.",
  },
  {
    name: "World & International Affairs",
    slug: "world-news",
    description: "Global diplomacy, multilateral initiatives, humanitarian affairs, and international relations.",
  },
  {
    name: "Technology & Science",
    slug: "technology-science",
    description: "Breakthroughs in computing, artificial intelligence, aerospace, energy, and scientific research.",
  },
] as const;

export const PROVISIONAL_NEWS_SOURCES: readonly BootstrapSourceDefinition[] = [
  {
    name: "Global Voices Nigeria",
    slug: "global-voices-nigeria",
    feedUrl: "https://globalvoices.org/tag/nigeria/feed/",
    feedType: NewsFeedType.RSS,
    categorySlug: "nigerian-affairs",
    pollIntervalMinutes: 1440,
    attributionPolicy: JSON.stringify({
      licenseName: "Creative Commons Attribution 3.0 (CC BY 3.0)",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      statement:
        "Licensed under Creative Commons Attribution 3.0. Attribution required: Credit original author and Global Voices with active hyperlink to the canonical source URL. Text is an AI-assisted summary of the original report. External multimedia excluded.",
      isPublicDomain: false,
    }),
    isProvisional: true,
  },
  {
    name: "Global Voices Advox",
    slug: "global-voices-advox",
    feedUrl: "https://advox.globalvoices.org/feed/",
    feedType: NewsFeedType.RSS,
    categorySlug: "technology-science",
    pollIntervalMinutes: 1440,
    attributionPolicy: JSON.stringify({
      licenseName: "Creative Commons Attribution 3.0 (CC BY 3.0)",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      statement:
        "Licensed under Creative Commons Attribution 3.0. Attribution required: Credit original author and Global Voices Advox with active hyperlink to the canonical source URL. Text is an AI-assisted summary. External multimedia excluded.",
      isPublicDomain: false,
    }),
    isProvisional: true,
  },
  {
    name: "European Commission Newsroom",
    slug: "european-commission-newsroom",
    feedUrl: "https://ec.europa.eu/commission/presscorner/api/rss?language=en",
    feedType: NewsFeedType.RSS,
    categorySlug: "world-news",
    pollIntervalMinutes: 1440,
    attributionPolicy: JSON.stringify({
      licenseName: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      statement:
        "Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0) under Commission Decision 2011/833/EU. Attribution required: Credit European Union with hyperlink to original release and CC BY 4.0 license. Text is an AI-assisted summary. Official EU logos excluded.",
      isPublicDomain: false,
    }),
    isProvisional: true,
  },
  {
    name: "GOV.UK Global News",
    slug: "gov-uk-global-news",
    feedUrl: "https://www.gov.uk/government/feed",
    feedType: NewsFeedType.ATOM,
    categorySlug: "world-news",
    pollIntervalMinutes: 1440,
    attributionPolicy: JSON.stringify({
      licenseName: "Open Government Licence v3.0 (OGL v3.0)",
      licenseUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      statement:
        "Contains public sector information licensed under the Open Government Licence v3.0. Attribution required: Display OGL v3.0 notice with hyperlink to canonical release and OGL license. Text is an AI-assisted summary. Royal Arms and crests excluded.",
      isPublicDomain: false,
    }),
    isProvisional: true,
  },
  {
    name: "NASA News & Discoveries",
    slug: "nasa-news",
    feedUrl: "https://www.nasa.gov/news-release/feed/",
    feedType: NewsFeedType.RSS,
    categorySlug: "technology-science",
    pollIntervalMinutes: 1440,
    attributionPolicy: JSON.stringify({
      licenseName: "U.S. Public Domain",
      licenseUrl: null,
      policyUrl: "https://www.nasa.gov/multimedia/guidelines/index.html",
      statement:
        "U.S. Public Domain (17 U.S.C. § 105). Courtesy of National Aeronautics and Space Administration (NASA). Hyperlink to original source release requested. Text is an AI-assisted summary. NASA media usage guidelines are an institutional policy reference, not a Creative Commons license. NASA insignia and astronaut likenesses excluded.",
      isPublicDomain: true,
    }),
    isProvisional: true,
  },
] as const;

export type BootstrapDbClient = {
  category: {
    upsert: (args: {
      where: { slug: string };
      update: { name: string; description: string };
      create: { name: string; slug: string; description: string };
      select: { id: true; slug: true };
    }) => Promise<{ id: string; slug: string }>;
  };
  newsSource: {
    findUnique: (args: {
      where: { slug?: string; feedUrl?: string };
    }) => Promise<{
      id: string;
      slug: string;
      feedUrl: string;
      name: string;
      isActive: boolean;
      defaultCategoryId: string | null;
      pollIntervalMinutes: number;
      attributionPolicy: string | null;
    } | null>;
    create: (args: {
      data: {
        name: string;
        slug: string;
        feedUrl: string;
        feedType: NewsFeedType;
        defaultCategoryId: string;
        pollIntervalMinutes: number;
        attributionPolicy: string;
        isActive: boolean;
        consecutiveFailures: number;
      };
    }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: {
        name: string;
        feedType: NewsFeedType;
        defaultCategoryId: string;
        pollIntervalMinutes: number;
        attributionPolicy: string;
      };
    }) => Promise<{ id: string }>;
  };
  $transaction?: <T>(fn: (tx: BootstrapDbClient) => Promise<T>) => Promise<T>;
};

/**
 * Parse CLI flags for the bootstrap script.
 */
export function parseBootstrapArgs(argv: readonly string[]): ParsedBootstrapArgs {
  let confirm: string | null = null;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      confirm = arg.slice("--confirm=".length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { confirm, dryRun };
}

/**
 * Validate runtime environment and confirmation flags.
 */
export function resolveBootstrap(
  env: Record<string, string | undefined>,
  args: ParsedBootstrapArgs,
): ResolveBootstrapResult {
  const isProduction = env.NODE_ENV === "production";

  if (isProduction) {
    if (args.confirm !== "production-bootstrap") {
      return {
        ok: false,
        reason:
          "Production bootstrap refused: missing required confirmation. Pass --confirm=production-bootstrap.",
      };
    }
    if (!env.DATABASE_URL || env.DATABASE_URL.trim() === "") {
      return {
        ok: false,
        reason: "Production bootstrap refused: DATABASE_URL is not set.",
      };
    }
  } else {
    if (args.confirm !== "bootstrap" && args.confirm !== "local-bootstrap") {
      return {
        ok: false,
        reason:
          "Bootstrap refused: missing required confirmation. Pass --confirm=bootstrap or --confirm=local-bootstrap.",
      };
    }
  }

  return {
    ok: true,
    options: {
      isProduction,
      dryRun: args.dryRun,
    },
  };
}

/**
 * Validate definitions for format and schema sanity before executing.
 */
export function validateBootstrapDefinitions(
  categories: readonly BootstrapCategoryDefinition[],
  sources: readonly BootstrapSourceDefinition[],
): void {
  const categorySlugs = new Set<string>();

  for (const cat of categories) {
    if (!cat.name || cat.name.trim() === "") {
      throw new Error(`Invalid category definition: empty name for slug '${cat.slug}'.`);
    }
    if (!cat.slug || cat.slug !== cat.slug.toLowerCase().trim() || /[^a-z0-9-]/.test(cat.slug)) {
      throw new Error(`Invalid category slug '${cat.slug}': must be lowercase alphanumeric with hyphens.`);
    }
    categorySlugs.add(cat.slug);
  }

  const seenSourceSlugs = new Set<string>();
  const seenFeedUrls = new Set<string>();

  for (const source of sources) {
    if (!source.name || source.name.trim() === "") {
      throw new Error(`Invalid source definition: empty name for slug '${source.slug}'.`);
    }
    if (!source.slug || source.slug !== source.slug.toLowerCase().trim() || /[^a-z0-9-]/.test(source.slug)) {
      throw new Error(`Invalid source slug '${source.slug}': must be lowercase alphanumeric with hyphens.`);
    }
    if (!source.feedUrl || source.feedUrl.trim() === "") {
      throw new Error(`Invalid source feed URL for slug '${source.slug}': URL is empty.`);
    }

    try {
      const parsedUrl = new URL(source.feedUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error(`Protocol '${parsedUrl.protocol}' not supported.`);
      }
    } catch (urlErr) {
      throw new Error(
        `Invalid source feed URL '${source.feedUrl}' for slug '${source.slug}': ${urlErr instanceof Error ? urlErr.message : String(urlErr)}`,
      );
    }

    if (!categorySlugs.has(source.categorySlug)) {
      throw new Error(
        `Source '${source.name}' references undefined category slug '${source.categorySlug}'.`,
      );
    }

    if (seenSourceSlugs.has(source.slug)) {
      throw new Error(`Duplicate source slug '${source.slug}' within bootstrap definitions.`);
    }
    seenSourceSlugs.add(source.slug);

    if (seenFeedUrls.has(source.feedUrl)) {
      throw new Error(`Duplicate feed URL '${source.feedUrl}' within bootstrap definitions.`);
    }
    seenFeedUrls.add(source.feedUrl);
  }
}

/**
 * Core transactional bootstrap logic.
 */
export async function executeBootstrapNewsSources(
  db: BootstrapDbClient,
  options: {
    categories?: readonly BootstrapCategoryDefinition[];
    sources?: readonly BootstrapSourceDefinition[];
    dryRun?: boolean;
  } = {},
): Promise<BootstrapExecutionResult> {
  const categories = options.categories ?? BOOTSTRAP_CATEGORIES;
  const sources = options.sources ?? PROVISIONAL_NEWS_SOURCES;
  const dryRun = options.dryRun ?? false;

  validateBootstrapDefinitions(categories, sources);

  const runner = async (tx: BootstrapDbClient): Promise<BootstrapExecutionResult> => {
    // 1. Upsert Categories
    const categoryIdBySlug = new Map<string, string>();
    let categoriesUpserted = 0;

    for (const cat of categories) {
      if (dryRun) {
        categoryIdBySlug.set(cat.slug, `dry-run-cat-${cat.slug}`);
        categoriesUpserted += 1;
        continue;
      }

      const row = await tx.category.upsert({
        where: { slug: cat.slug },
        update: {
          name: cat.name,
          description: cat.description,
        },
        create: {
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
        },
        select: { id: true, slug: true },
      });

      categoryIdBySlug.set(row.slug, row.id);
      categoriesUpserted += 1;
    }

    // 2. Preflight Conflict Detection & Source Provisioning
    let sourcesCreated = 0;
    let sourcesUpdated = 0;
    let sourcesUnchanged = 0;

    for (const source of sources) {
      const categoryId = categoryIdBySlug.get(source.categorySlug);
      if (!categoryId) {
        throw new Error(
          `Target category '${source.categorySlug}' not found for source '${source.name}'.`,
        );
      }

      const existingBySlug = await tx.newsSource.findUnique({
        where: { slug: source.slug },
      });
      const existingByUrl = await tx.newsSource.findUnique({
        where: { feedUrl: source.feedUrl },
      });

      // Cross-collision check
      if (existingBySlug && existingByUrl && existingBySlug.id !== existingByUrl.id) {
        throw new Error(
          `Bootstrap conflict for source '${source.name}': slug '${source.slug}' and feedUrl '${source.feedUrl}' resolve to two distinct existing sources. Aborting bootstrap.`,
        );
      }

      // Slug collision with different URL
      if (existingBySlug && existingBySlug.feedUrl !== source.feedUrl) {
        throw new Error(
          `Bootstrap conflict for source '${source.name}': slug '${source.slug}' already exists with different feedUrl '${existingBySlug.feedUrl}'. Expected '${source.feedUrl}'. Aborting bootstrap to prevent unexpected mutation.`,
        );
      }

      // URL collision with different slug
      if (existingByUrl && existingByUrl.slug !== source.slug) {
        throw new Error(
          `Bootstrap conflict for source '${source.name}': feedUrl '${source.feedUrl}' already exists under different slug '${existingByUrl.slug}'. Expected '${source.slug}'. Aborting bootstrap.`,
        );
      }

      if (existingBySlug) {
        // Source already exists: check if declarative updates are needed
        const isIdentical =
          existingBySlug.name === source.name &&
          existingBySlug.defaultCategoryId === categoryId &&
          existingBySlug.pollIntervalMinutes === source.pollIntervalMinutes &&
          existingBySlug.attributionPolicy === source.attributionPolicy;

        if (isIdentical) {
          sourcesUnchanged += 1;
          continue;
        }

        if (!dryRun) {
          // Update declarative attributes only. NEVER touch operational telemetry or isActive.
          await tx.newsSource.update({
            where: { id: existingBySlug.id },
            data: {
              name: source.name,
              feedType: source.feedType,
              defaultCategoryId: categoryId,
              pollIntervalMinutes: source.pollIntervalMinutes,
              attributionPolicy: source.attributionPolicy,
            },
          });
        }
        sourcesUpdated += 1;
      } else {
        // Brand new source
        if (!dryRun) {
          // Provisional sources MUST be inactive upon creation until verified
          const initialIsActive = source.isProvisional ? false : false;

          await tx.newsSource.create({
            data: {
              name: source.name,
              slug: source.slug,
              feedUrl: source.feedUrl,
              feedType: source.feedType,
              defaultCategoryId: categoryId,
              pollIntervalMinutes: source.pollIntervalMinutes,
              attributionPolicy: source.attributionPolicy,
              isActive: initialIsActive,
              consecutiveFailures: 0,
            },
          });
        }
        sourcesCreated += 1;
      }
    }

    return {
      dryRun,
      categoriesUpserted,
      sourcesCreated,
      sourcesUpdated,
      sourcesUnchanged,
    };
  };

  // Run in a single transaction when the client supports it
  if (typeof db.$transaction === "function" && !dryRun) {
    return db.$transaction((tx) => runner(tx));
  }

  return runner(db);
}

function abort(message: string): never {
  process.stderr.write(`[BOOTSTRAP ERROR] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let parsed: ParsedBootstrapArgs;
  try {
    parsed = parseBootstrapArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid arguments.";
    abort(message);
  }

  const resolved = resolveBootstrap(process.env, parsed);
  if (!resolved.ok) {
    abort(resolved.reason);
  }

  const prisma = new PrismaClient();

  try {
    process.stdout.write(
      `[BOOTSTRAP] Starting news-source bootstrap (${resolved.options.isProduction ? "PRODUCTION" : "LOCAL"}${resolved.options.dryRun ? ", DRY RUN" : ""})...\n`,
    );

    const result = await executeBootstrapNewsSources(prisma as unknown as BootstrapDbClient, {
      dryRun: resolved.options.dryRun,
    });

    process.stdout.write(
      `[BOOTSTRAP] Completed successfully:\n` +
        `  - Categories processed: ${result.categoriesUpserted}\n` +
        `  - Provisional sources created (inactive): ${result.sourcesCreated}\n` +
        `  - Sources updated: ${result.sourcesUpdated}\n` +
        `  - Sources unchanged: ${result.sourcesUnchanged}\n` +
        `  - Dry run: ${result.dryRun ? "YES" : "NO"}\n`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    abort(message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
