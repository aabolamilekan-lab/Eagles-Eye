import "server-only";
import { NewsFeedType, type PrismaClient } from "@prisma/client";

export interface NewsCategorySeedDefinition {
  name: string;
  slug: string;
  description: string;
}

export interface NewsSourceSeedDefinition {
  name: string;
  slug: string;
  feedUrl: string;
  feedType: NewsFeedType;
  categorySlug: string;
  pollIntervalMinutes: number;
  attributionPolicy: string;
}

export const initialNewsCategories: readonly NewsCategorySeedDefinition[] = [
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

export const initialApprovedNewsSources: readonly NewsSourceSeedDefinition[] = [
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
  },
] as const;

export interface NewsSeedResult {
  categoriesUpserted: number;
  sourcesCreated: number;
  sourcesUpdated: number;
}

export type NewsSeedDbClient = {
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
      lastFetchedAt?: Date | null;
      lastSuccessAt?: Date | null;
      lastErrorAt?: Date | null;
      lastErrorMessage?: string | null;
      consecutiveFailures?: number;
      etag?: string | null;
      lastModified?: string | null;
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
};

/**
 * Idempotently seed news categories and verified news sources with preflight collision checks.
 *
 * Guarantees:
 * 1. Upserts categories idempotently by unique slug.
 * 2. Aborts immediately on slug or feedUrl collision without corrupting existing records.
 * 3. Never overwrites operational telemetry (lastFetchedAt, lastSuccessAt, etag, failures).
 */
export async function seedNewsCategoriesAndSources(
  client: NewsSeedDbClient | PrismaClient,
  options: {
    categories?: readonly NewsCategorySeedDefinition[];
    sources?: readonly NewsSourceSeedDefinition[];
  } = {},
): Promise<NewsSeedResult> {
  const categoriesToSeed = options.categories ?? initialNewsCategories;
  const sourcesToSeed = options.sources ?? initialApprovedNewsSources;

  const db = client as NewsSeedDbClient;

  // 1. Idempotently upsert categories
  const categoryIdBySlug = new Map<string, string>();
  let categoriesUpserted = 0;

  for (const cat of categoriesToSeed) {
    const row = await db.category.upsert({
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

  // 2. Seed sources with strict preflight collision detection
  let sourcesCreated = 0;
  let sourcesUpdated = 0;

  for (const source of sourcesToSeed) {
    const categoryId = categoryIdBySlug.get(source.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Failed to seed source '${source.name}': Target category slug '${source.categorySlug}' not found.`,
      );
    }

    // Preflight lookups
    const existingBySlug = await db.newsSource.findUnique({
      where: { slug: source.slug },
    });
    const existingByUrl = await db.newsSource.findUnique({
      where: { feedUrl: source.feedUrl },
    });

    // Conflict Check 1: Cross-collision (slug belongs to row A, url belongs to row B)
    if (existingBySlug && existingByUrl && existingBySlug.id !== existingByUrl.id) {
      throw new Error(
        `Seeding conflict for source '${source.name}': Slug '${source.slug}' belongs to source '${existingBySlug.name}' (${existingBySlug.id}), but feedUrl '${source.feedUrl}' belongs to source '${existingByUrl.name}' (${existingByUrl.id}). Aborting seed.`,
      );
    }

    // Conflict Check 2: Slug collision with different URL
    if (existingBySlug && existingBySlug.feedUrl !== source.feedUrl) {
      throw new Error(
        `Seeding conflict for source '${source.name}': Slug '${source.slug}' already exists with a different feedUrl '${existingBySlug.feedUrl}'. Expected '${source.feedUrl}'. Aborting seed to prevent accidental configuration change.`,
      );
    }

    // Conflict Check 3: URL collision with different Slug
    if (existingByUrl && existingByUrl.slug !== source.slug) {
      throw new Error(
        `Seeding conflict for source '${source.name}': feedUrl '${source.feedUrl}' already exists under a different slug '${existingByUrl.slug}'. Expected '${source.slug}'. Aborting seed.`,
      );
    }

    if (existingBySlug) {
      // Safe update: update only declarative metadata. NEVER touch operational telemetry.
      await db.newsSource.update({
        where: { id: existingBySlug.id },
        data: {
          name: source.name,
          feedType: source.feedType,
          defaultCategoryId: categoryId,
          pollIntervalMinutes: source.pollIntervalMinutes,
          attributionPolicy: source.attributionPolicy,
        },
      });
      sourcesUpdated += 1;
    } else {
      // Safe creation
      await db.newsSource.create({
        data: {
          name: source.name,
          slug: source.slug,
          feedUrl: source.feedUrl,
          feedType: source.feedType,
          defaultCategoryId: categoryId,
          pollIntervalMinutes: source.pollIntervalMinutes,
          attributionPolicy: source.attributionPolicy,
          isActive: true,
          consecutiveFailures: 0,
        },
      });
      sourcesCreated += 1;
    }
  }

  return {
    categoriesUpserted,
    sourcesCreated,
    sourcesUpdated,
  };
}
