import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acquireSyncLock, releaseSyncLock } from "@/lib/news/lock";
import { persistImportedArticleRecord } from "@/lib/news/persistence";

const LOCAL_ADMIN_URL = "postgresql://postgres:ABIODUN@localhost:5432/postgres?schema=public";
const ISOLATED_DB_NAME = "eagles_eye_isolated_verify";
const ISOLATED_DB_URL = `postgresql://postgres:ABIODUN@localhost:5432/${ISOLATED_DB_NAME}?schema=public`;

async function runSqlFile(prisma: PrismaClient, relativePath: string): Promise<void> {
  const filePath = path.join(process.cwd(), relativePath);
  const rawSql = fs.readFileSync(filePath, "utf8");
  const statements = rawSql
    .split(/;\s*[\r\n]+/)
    .map((stmt) => stmt.replace(/--.*$/gm, "").trim())
    .filter((stmt) => stmt.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

describe("Isolated PostgreSQL Integration Verification", () => {
  let adminPrisma: PrismaClient;
  let testPrisma: PrismaClient;
  let testSourceId: string;

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: LOCAL_ADMIN_URL } } });

    // Clean up and recreate isolated test database
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${ISOLATED_DB_NAME};`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${ISOLATED_DB_NAME};`);

    testPrisma = new PrismaClient({ datasources: { db: { url: ISOLATED_DB_URL } } });

    // Apply baseline migrations 1 to 5
    await runSqlFile(testPrisma, "prisma/migrations/20261002000000_init/migration.sql");
    await runSqlFile(testPrisma, "prisma/migrations/20261002010000_add_auth/migration.sql");
    await runSqlFile(testPrisma, "prisma/migrations/20261003082334_add_search_trgm_indexes/migration.sql");
    await runSqlFile(testPrisma, "prisma/migrations/20261005120000_add_cover_and_view_indexes/migration.sql");
    await runSqlFile(testPrisma, "prisma/migrations/20261012120000_add_news_aggregation_models/migration.sql");

    // Apply Migration 6 (unique source external id)
    await runSqlFile(testPrisma, "prisma/migrations/20261012140000_unique_source_external_id/migration.sql");

    // Create a news source for testing
    const source = await testPrisma.newsSource.create({
      data: {
        name: "Verified News Wire",
        slug: "verified-news-wire",
        feedUrl: "https://verifiedwire.example/rss.xml",
      },
    });
    testSourceId = source.id;
  }, 45000);

  afterAll(async () => {
    if (testPrisma) {
      await testPrisma.$disconnect();
    }
    if (adminPrisma) {
      try {
        await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${ISOLATED_DB_NAME};`);
      } finally {
        await adminPrisma.$disconnect();
      }
    }
  });

  it("verifies migration 6 replaced non-unique index with unique index on PostgreSQL", async () => {
    const indexes: Array<{ indexname: string }> = await testPrisma.$queryRaw`
      SELECT indexname FROM pg_indexes WHERE tablename = 'ImportedArticle';
    `;
    const indexNames = indexes.map((i) => i.indexname);

    expect(indexNames).not.toContain("ImportedArticle_sourceId_externalId_idx");
    expect(indexNames).toContain("ImportedArticle_sourceId_externalId_key");
  });

  it("safely arbitrates concurrent lock acquisition: exactly 1 worker wins across 10 contenders", async () => {
    const lockPromises = Array.from({ length: 10 }, (_, i) =>
      acquireSyncLock("global_news_sync", 30_000, `concurrent-worker-${i}`, new Date(), testPrisma as unknown as import("@/lib/news/lock").LockClient),
    );

    const results = await Promise.all(lockPromises);
    const winners = results.filter((r) => r.acquired);
    const losers = results.filter((r) => !r.acquired);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);

    const winnerId = winners[0]!.workerId;

    // Verify stale worker cannot release the winner's active lock
    const staleRelease = await releaseSyncLock("global_news_sync", "stale-fake-worker", testPrisma as unknown as import("@/lib/news/lock").LockClient);
    expect(staleRelease).toBe(false);

    // Winner releases successfully
    const winnerRelease = await releaseSyncLock("global_news_sync", winnerId, testPrisma as unknown as import("@/lib/news/lock").LockClient);
    expect(winnerRelease).toBe(true);
  });

  it("reclaims an expired lease and rejects stale workers from releasing the new lease", async () => {
    // Manually force lock into expired state
    await testPrisma.newsSyncLock.update({
      where: { id: "global_news_sync" },
      data: {
        lockedBy: "stale-crashed-worker",
        lockedUntil: new Date(Date.now() - 10000), // 10 seconds in the past
      },
    });

    // New worker recovers lease
    const recovery = await acquireSyncLock("global_news_sync", 30_000, "recovery-worker-1", new Date(), testPrisma as unknown as import("@/lib/news/lock").LockClient);
    expect(recovery.acquired).toBe(true);
    expect(recovery.workerId).toBe("recovery-worker-1");

    // Stale crashed worker attempts to release -> rejected
    const staleAttempt = await releaseSyncLock("global_news_sync", "stale-crashed-worker", testPrisma as unknown as import("@/lib/news/lock").LockClient);
    expect(staleAttempt).toBe(false);

    // Active recovery worker releases -> succeeds
    const validRelease = await releaseSyncLock("global_news_sync", "recovery-worker-1", testPrisma as unknown as import("@/lib/news/lock").LockClient);
    expect(validRelease).toBe(true);
  });

  it("handles concurrent insertion of identical canonical URL: 1 persists, 4 catch duplicate", async () => {
    const canonicalUrl = "https://verifiedwire.example/breaking-fusion-discovery";
    const insertPromises = Array.from({ length: 5 }, (_, i) =>
      persistImportedArticleRecord(
        {
          sourceId: testSourceId,
          externalId: `guid-${i}`,
          canonicalUrl,
          title: `Fusion Discovery Worker ${i}`,
          author: "Science Correspondent",
          rawPublishedAt: new Date(),
          summary: "Summary text",
          contentHash: `hash-${i}`,
          storyDraft: {
            title: `Fusion Discovery Worker ${i}`,
            slug: `fusion-discovery-${i}`,
            shortDescription: "Short text",
            description: "<p>Sanitized content</p>",
            author: "Science Correspondent",
            status: "DRAFT",
            publishedAt: null,
            sourceName: "Verified News Wire",
            canonicalUrl,
          },
        },
        testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
      ),
    );

    const results = await Promise.all(insertPromises);
    const persisted = results.filter((r) => !r.isDuplicate);
    const duplicates = results.filter((r) => r.isDuplicate);

    expect(persisted).toHaveLength(1);
    expect(duplicates).toHaveLength(4);
    expect(duplicates.every((d) => d.importedArticleId === persisted[0]!.importedArticleId)).toBe(true);
  });

  it("enforces source-scoped external ID uniqueness in PostgreSQL", async () => {
    const externalId = "unique-scoped-guid-456";

    const first = await persistImportedArticleRecord(
      {
        sourceId: testSourceId,
        externalId,
        canonicalUrl: "https://verifiedwire.example/ext-test-1",
        title: "External ID Test 1",
        author: "Author 1",
        rawPublishedAt: new Date(),
        summary: "Summary 1",
        contentHash: "hash-ext-1",
      },
      testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
    );
    expect(first.isDuplicate).toBe(false);

    // Second article has different canonical URL but identical (sourceId, externalId)
    const second = await persistImportedArticleRecord(
      {
        sourceId: testSourceId,
        externalId,
        canonicalUrl: "https://verifiedwire.example/ext-test-2-different-url",
        title: "External ID Test 2",
        author: "Author 2",
        rawPublishedAt: new Date(),
        summary: "Summary 2",
        contentHash: "hash-ext-2",
      },
      testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
    );
    expect(second.isDuplicate).toBe(true);
    expect(second.importedArticleId).toBe(first.importedArticleId);
  });

  it("permits multiple articles with NULL external IDs on the same source", async () => {
    const articleA = await persistImportedArticleRecord(
      {
        sourceId: testSourceId,
        externalId: null,
        canonicalUrl: "https://verifiedwire.example/null-guid-alpha",
        title: "Null GUID Alpha",
        author: null,
        rawPublishedAt: new Date(),
        summary: "Summary",
        contentHash: "hash-null-a",
      },
      testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
    );

    const articleB = await persistImportedArticleRecord(
      {
        sourceId: testSourceId,
        externalId: null,
        canonicalUrl: "https://verifiedwire.example/null-guid-beta",
        title: "Null GUID Beta",
        author: null,
        rawPublishedAt: new Date(),
        summary: "Summary",
        contentHash: "hash-null-b",
      },
      testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
    );

    expect(articleA.isDuplicate).toBe(false);
    expect(articleB.isDuplicate).toBe(false);
    expect(articleA.importedArticleId).not.toBe(articleB.importedArticleId);
  });

  it("verifies in PostgreSQL that created story draft strictly has status=DRAFT and publishedAt=null", async () => {
    const res = await persistImportedArticleRecord(
      {
        sourceId: testSourceId,
        externalId: "story-invariant-guid-77",
        canonicalUrl: "https://verifiedwire.example/story-invariant-check",
        title: "Draft Story Invariant Check",
        author: "Investigative Desk",
        rawPublishedAt: new Date(),
        summary: "Summary text",
        contentHash: "hash-inv-77",
        storyDraft: {
          title: "Draft Story Invariant Check",
          slug: "draft-story-invariant-check",
          shortDescription: "Short text",
          description: "<p>Sanitized content</p>",
          author: "Investigative Desk",
          status: "DRAFT",
          publishedAt: null,
          sourceName: "Verified News Wire",
          canonicalUrl: "https://verifiedwire.example/story-invariant-check",
        },
      },
      testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
    );

    expect(res.storyId).toBeDefined();

    const storyInDb = await testPrisma.story.findUnique({
      where: { id: res.storyId! },
    });

    expect(storyInDb).not.toBeNull();
    expect(storyInDb?.status).toBe("DRAFT");
    expect(storyInDb?.publishedAt).toBeNull();
  });

  it("protects existing published stories from being overwritten by slug collisions", async () => {
    const published = await testPrisma.story.create({
      data: {
        title: "Important Global Summit",
        slug: "important-global-summit",
        status: "PUBLISHED",
        publishedAt: new Date("2026-05-01T10:00:00Z"),
      },
    });

    const draftRes = await persistImportedArticleRecord(
      {
        sourceId: testSourceId,
        externalId: "summit-wire-update-99",
        canonicalUrl: "https://verifiedwire.example/summit-wire-update",
        title: "Important Global Summit",
        author: "Wire Staff",
        rawPublishedAt: new Date(),
        summary: "Summary text",
        contentHash: "hash-summit-99",
        storyDraft: {
          title: "Important Global Summit",
          slug: "important-global-summit",
          shortDescription: "Draft summary",
          description: "<p>Draft content</p>",
          author: "Wire Staff",
          status: "DRAFT",
          publishedAt: null,
          sourceName: "Verified News Wire",
          canonicalUrl: "https://verifiedwire.example/summit-wire-update",
        },
      },
      testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
    );

    const publishedAfter = await testPrisma.story.findUnique({ where: { id: published.id } });
    const draftAfter = await testPrisma.story.findUnique({ where: { id: draftRes.storyId! } });

    expect(publishedAfter?.status).toBe("PUBLISHED");
    expect(publishedAfter?.slug).toBe("important-global-summit");
    expect(draftAfter?.status).toBe("DRAFT");
    expect(draftAfter?.slug).not.toBe("important-global-summit");
    expect(draftAfter?.slug).toMatch(/^important-global-summit-[0-9a-f]{6}$/);
  });

  it("verifies atomic rollback: foreign key error leaves zero partial Story or ImportedArticle records", async () => {
    const storyCountBefore = await testPrisma.story.count();
    const importedCountBefore = await testPrisma.importedArticle.count();

    await expect(
      persistImportedArticleRecord(
        {
          sourceId: "non-existent-source-id-foreign-key-error",
          externalId: "rollback-guid",
          canonicalUrl: "https://verifiedwire.example/rollback-attempt",
          title: "Rollback Attempt",
          author: null,
          rawPublishedAt: new Date(),
          summary: null,
          contentHash: "hash-rollback",
          storyDraft: {
            title: "Rollback Attempt",
            slug: "rollback-attempt",
            shortDescription: "Short text",
            description: "<p>Content</p>",
            author: null,
            status: "DRAFT",
            publishedAt: null,
            sourceName: "Non-existent Wire",
            canonicalUrl: "https://verifiedwire.example/rollback-attempt",
          },
        },
        testPrisma as unknown as import("@/lib/news/persistence").PersistenceClient,
      ),
    ).rejects.toThrow();

    const storyCountAfter = await testPrisma.story.count();
    const importedCountAfter = await testPrisma.importedArticle.count();

    expect(storyCountAfter).toBe(storyCountBefore);
    expect(importedCountAfter).toBe(importedCountBefore);
  });
});
