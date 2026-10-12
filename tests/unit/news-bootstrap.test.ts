import { describe, expect, it } from "vitest";
import { NewsFeedType } from "@prisma/client";
import {
  parseBootstrapArgs,
  resolveBootstrap,
  validateBootstrapDefinitions,
  executeBootstrapNewsSources,
  BOOTSTRAP_CATEGORIES,
  PROVISIONAL_NEWS_SOURCES,
  type BootstrapDbClient,
  type BootstrapCategoryDefinition,
  type BootstrapSourceDefinition,
} from "../../scripts/bootstrap-news-sources";

function createMockBootstrapDb() {
  const categories: Array<{ id: string; name: string; slug: string; description: string }> = [];
  const sources: Array<{
    id: string;
    name: string;
    slug: string;
    feedUrl: string;
    feedType: NewsFeedType;
    defaultCategoryId: string | null;
    pollIntervalMinutes: number;
    attributionPolicy: string | null;
    isActive: boolean;
    consecutiveFailures: number;
    lastFetchedAt?: Date | null;
    lastSuccessAt?: Date | null;
    lastErrorAt?: Date | null;
    lastErrorMessage?: string | null;
    etag?: string | null;
    lastModified?: string | null;
  }> = [];

  const client: BootstrapDbClient = {
    category: {
      upsert: async ({ where, update, create }) => {
        const existing = categories.find((c) => c.slug === where.slug);
        if (existing) {
          existing.name = update.name;
          existing.description = update.description;
          return { id: existing.id, slug: existing.slug };
        }
        const created = {
          id: `cat-${Math.random().toString(36).slice(2, 9)}`,
          name: create.name,
          slug: create.slug,
          description: create.description,
        };
        categories.push(created);
        return { id: created.id, slug: created.slug };
      },
    },
    newsSource: {
      findUnique: async ({ where }) => {
        if (where.slug) {
          return sources.find((s) => s.slug === where.slug) ?? null;
        }
        if (where.feedUrl) {
          return sources.find((s) => s.feedUrl === where.feedUrl) ?? null;
        }
        return null;
      },
      create: async ({ data }) => {
        const id = `src-${Math.random().toString(36).slice(2, 9)}`;
        const record = { id, ...data };
        sources.push(record);
        return { id };
      },
      update: async ({ where, data }) => {
        const target = sources.find((s) => s.id === where.id);
        if (!target) {
          throw new Error(`NewsSource with id ${where.id} not found`);
        }
        Object.assign(target, data);
        return { id: target.id };
      },
    },
    $transaction: async (fn) => fn(client),
  };

  return { client, categories, sources };
}

describe("scripts/bootstrap-news-sources", () => {
  describe("parseBootstrapArgs", () => {
    it("parses valid confirm flags and dry-run flag", () => {
      const args = parseBootstrapArgs(["--confirm=production-bootstrap", "--dry-run"]);
      expect(args.confirm).toBe("production-bootstrap");
      expect(args.dryRun).toBe(true);
    });

    it("parses local bootstrap confirm flag without dry-run", () => {
      const args = parseBootstrapArgs(["--confirm=bootstrap"]);
      expect(args.confirm).toBe("bootstrap");
      expect(args.dryRun).toBe(false);
    });

    it("throws on unknown arguments to prevent flag typos", () => {
      expect(() => parseBootstrapArgs(["--confirm-prod"])).toThrow(/Unknown argument: --confirm-prod/);
      expect(() => parseBootstrapArgs(["--force"])).toThrow(/Unknown argument: --force/);
    });
  });

  describe("resolveBootstrap", () => {
    it("requires --confirm=production-bootstrap in production environment", () => {
      const res = resolveBootstrap(
        { NODE_ENV: "production", DATABASE_URL: "postgresql://localhost:5432/db" },
        { confirm: "bootstrap", dryRun: false },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toContain("Pass --confirm=production-bootstrap");
      }
    });

    it("requires DATABASE_URL in production environment", () => {
      const res = resolveBootstrap(
        { NODE_ENV: "production", DATABASE_URL: "" },
        { confirm: "production-bootstrap", dryRun: false },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toContain("DATABASE_URL is not set");
      }
    });

    it("succeeds in production when properly confirmed", () => {
      const res = resolveBootstrap(
        { NODE_ENV: "production", DATABASE_URL: "postgresql://localhost:5432/db" },
        { confirm: "production-bootstrap", dryRun: false },
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.options.isProduction).toBe(true);
        expect(res.options.dryRun).toBe(false);
      }
    });

    it("requires --confirm=bootstrap or --confirm=local-bootstrap in non-production", () => {
      const invalid = resolveBootstrap(
        { NODE_ENV: "development" },
        { confirm: null, dryRun: false },
      );
      expect(invalid.ok).toBe(false);

      const validLocal = resolveBootstrap(
        { NODE_ENV: "development" },
        { confirm: "local-bootstrap", dryRun: true },
      );
      expect(validLocal.ok).toBe(true);
      if (validLocal.ok) {
        expect(validLocal.options.isProduction).toBe(false);
        expect(validLocal.options.dryRun).toBe(true);
      }
    });
  });

  describe("validateBootstrapDefinitions", () => {
    it("validates that default categories and provisional sources conform to contract", () => {
      expect(() =>
        validateBootstrapDefinitions(BOOTSTRAP_CATEGORIES, PROVISIONAL_NEWS_SOURCES),
      ).not.toThrow();

      expect(BOOTSTRAP_CATEGORIES).toHaveLength(3);
      expect(PROVISIONAL_NEWS_SOURCES).toHaveLength(5);
    });

    it("rejects invalid category slugs", () => {
      const invalidCat: BootstrapCategoryDefinition[] = [
        { name: "Bad Slug", slug: "Bad_Slug!", description: "Description" },
      ];
      expect(() => validateBootstrapDefinitions(invalidCat, [])).toThrow(/Invalid category slug/);
    });

    it("rejects sources with non-http/https protocol", () => {
      const invalidSource: BootstrapSourceDefinition[] = [
        {
          name: "File Source",
          slug: "file-source",
          feedUrl: "file:///etc/passwd",
          feedType: NewsFeedType.RSS,
          categorySlug: "nigerian-affairs",
          pollIntervalMinutes: 1440,
          attributionPolicy: "policy",
        },
      ];
      expect(() => validateBootstrapDefinitions(BOOTSTRAP_CATEGORIES, invalidSource)).toThrow(
        /Protocol 'file:' not supported/,
      );
    });

    it("rejects sources referencing non-existent categories", () => {
      const invalidSource: BootstrapSourceDefinition[] = [
        {
          name: "Unknown Cat Source",
          slug: "unknown-cat-source",
          feedUrl: "https://example.com/rss.xml",
          feedType: NewsFeedType.RSS,
          categorySlug: "non-existent-category",
          pollIntervalMinutes: 1440,
          attributionPolicy: "policy",
        },
      ];
      expect(() => validateBootstrapDefinitions(BOOTSTRAP_CATEGORIES, invalidSource)).toThrow(
        /references undefined category slug 'non-existent-category'/,
      );
    });
  });

  describe("executeBootstrapNewsSources (Transactional Execution & Invariants)", () => {
    it("creates 3 categories and 5 provisional sources with isActive = false", async () => {
      const { client, categories, sources } = createMockBootstrapDb();

      const result = await executeBootstrapNewsSources(client);

      expect(result.categoriesUpserted).toBe(3);
      expect(result.sourcesCreated).toBe(5);
      expect(result.sourcesUpdated).toBe(0);
      expect(result.sourcesUnchanged).toBe(0);

      expect(categories).toHaveLength(3);
      expect(sources).toHaveLength(5);

      // Verify provisional sources are inactive by default (Requirement 4)
      for (const source of sources) {
        expect(source.isActive).toBe(false);
        expect(source.consecutiveFailures).toBe(0);
        expect(source.pollIntervalMinutes).toBe(1440);
      }
    });

    it("is strictly idempotent: repeated executions perform zero duplicate writes", async () => {
      const { client, categories, sources } = createMockBootstrapDb();

      // First run
      const firstRun = await executeBootstrapNewsSources(client);
      expect(firstRun.sourcesCreated).toBe(5);

      // Second run
      const secondRun = await executeBootstrapNewsSources(client);
      expect(secondRun.categoriesUpserted).toBe(3);
      expect(secondRun.sourcesCreated).toBe(0);
      expect(secondRun.sourcesUpdated).toBe(0);
      expect(secondRun.sourcesUnchanged).toBe(5);

      expect(categories).toHaveLength(3);
      expect(sources).toHaveLength(5);
    });

    it("preserves operator telemetry and active status on re-runs (Requirement 5 & 7)", async () => {
      const { client, sources } = createMockBootstrapDb();

      // Initial run
      await executeBootstrapNewsSources(client);

      // Simulate operator activation and live aggregation telemetry
      const target = sources[0]!;
      target.isActive = true; // Operator activated this source
      target.consecutiveFailures = 2;
      target.lastFetchedAt = new Date("2026-10-12T12:00:00Z");
      target.lastSuccessAt = new Date("2026-10-12T11:00:00Z");
      target.etag = '"etag-abc"';
      target.lastModified = "Mon, 12 Oct 2026 12:00:00 GMT";

      // Re-run bootstrap
      const reRun = await executeBootstrapNewsSources(client);
      expect(reRun.sourcesUnchanged).toBe(5);

      // Verify telemetry and active status were NOT reverted or touched
      expect(target.isActive).toBe(true);
      expect(target.consecutiveFailures).toBe(2);
      expect(target.lastFetchedAt).toEqual(new Date("2026-10-12T12:00:00Z"));
      expect(target.lastSuccessAt).toEqual(new Date("2026-10-12T11:00:00Z"));
      expect(target.etag).toBe('"etag-abc"');
      expect(target.lastModified).toBe("Mon, 12 Oct 2026 12:00:00 GMT");
    });

    it("aborts on slug collision with different feed URL (Requirement 6)", async () => {
      const { client } = createMockBootstrapDb();

      // Pre-populate with conflicting URL
      const conflictingSource: BootstrapSourceDefinition[] = [
        {
          name: "Global Voices Nigeria",
          slug: "global-voices-nigeria",
          feedUrl: "https://different-domain.example/nigeria/feed.xml",
          feedType: NewsFeedType.RSS,
          categorySlug: "nigerian-affairs",
          pollIntervalMinutes: 1440,
          attributionPolicy: "policy",
        },
      ];

      // First create the existing conflicting record
      await executeBootstrapNewsSources(client, { sources: conflictingSource });

      // Running standard bootstrap must abort immediately
      await expect(executeBootstrapNewsSources(client)).rejects.toThrow(
        /Bootstrap conflict for source 'Global Voices Nigeria': slug 'global-voices-nigeria' already exists with different feedUrl/,
      );
    });

    it("aborts on feed URL collision under a different slug (Requirement 6)", async () => {
      const { client } = createMockBootstrapDb();

      // Pre-populate with conflicting slug for the same feed URL
      const conflictingSource: BootstrapSourceDefinition[] = [
        {
          name: "Alternative Slug Source",
          slug: "alternative-nigeria-slug",
          feedUrl: "https://globalvoices.org/tag/nigeria/feed/",
          feedType: NewsFeedType.RSS,
          categorySlug: "nigerian-affairs",
          pollIntervalMinutes: 1440,
          attributionPolicy: "policy",
        },
      ];

      await executeBootstrapNewsSources(client, { sources: conflictingSource });

      await expect(executeBootstrapNewsSources(client)).rejects.toThrow(
        /feedUrl 'https:\/\/globalvoices\.org\/tag\/nigeria\/feed\/' already exists under different slug 'alternative-nigeria-slug'/,
      );
    });

    it("supports dry-run mode without modifying records", async () => {
      const { client, categories, sources } = createMockBootstrapDb();

      const result = await executeBootstrapNewsSources(client, { dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.categoriesUpserted).toBe(3);
      expect(result.sourcesCreated).toBe(5);

      // No actual writes made in dry run
      expect(categories).toHaveLength(0);
      expect(sources).toHaveLength(0);
    });
  });
});
