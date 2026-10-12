import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { acquireSyncLock, releaseSyncLock } from "./lock";
import { sanitizeSyncErrorMessage } from "./sanitizer";
import type { NewsDatabaseSyncPort, ProposedStoryDraft } from "./aggregator";

/**
 * News Database Persistence Adapter.
 *
 * Implements the NewsDatabaseSyncPort interface for PostgreSQL via Prisma:
 * 1. Executes multi-entity writes (Story draft + ImportedArticle) within atomic transactions.
 * 2. Strictly enforces DRAFT status (status = 'DRAFT', publishedAt = null) for all imported stories.
 * 3. Handles uniqueness constraints (canonicalUrl and sourceId_externalId) safely without failing the batch.
 * 4. Resolves slug collisions by appending deterministic random entropy.
 * 5. Records structured audit logs in NewsSyncLog.
 * 6. Never enables or triggers automated publishing (NEWS_AUTO_PUBLISH=false invariant).
 */

export interface PersistArticleInput {
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  rawPublishedAt: Date | null;
  summary: string | null;
  contentHash: string;
  syncStatus?: string;
  storyDraft?: ProposedStoryDraft;
}

export interface PersistArticleResult {
  importedArticleId: string;
  storyId?: string;
  isDuplicate?: boolean;
}

export interface SyncLogInput {
  sourceId?: string;
  jobId: string;
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  discoveredCount: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  errorMessage?: string;
}

export interface DatabaseTransactionClient {
  story: {
    findUnique: (args: {
      where: { slug?: string; id?: string };
      select?: Record<string, boolean>;
    }) => Promise<{ id: string } | null>;
    create: (args: {
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<{ id: string }>;
  };
  importedArticle: {
    create: (args: {
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<{ id: string }>;
  };
}

export interface PersistenceClient {
  story: DatabaseTransactionClient["story"];
  importedArticle: {
    findUnique: (args: {
      where: { canonicalUrl?: string; sourceId_externalId?: { sourceId: string; externalId: string } };
      select?: Record<string, boolean>;
    }) => Promise<{ id: string; storyId: string | null; contentHash: string; syncStatus?: string } | null>;
    create: DatabaseTransactionClient["importedArticle"]["create"];
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  newsSyncLog: {
    create: (args: { data: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<{ id: string }>;
  };
  newsSyncLock?: import("./lock").LockClient["newsSyncLock"];
  $transaction: <T>(fn: (tx: DatabaseTransactionClient) => Promise<T>) => Promise<T>;
}

/**
 * Check if an error is a Prisma unique constraint violation (P2002).
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (
    (error as Prisma.PrismaClientKnownRequestError).code === "P2002" ||
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Generate a unique slug, appending a short suffix if already taken.
 */
export async function resolveUniqueStorySlug(
  baseSlug: string,
  tx: DatabaseTransactionClient,
): Promise<string> {
  const existing = await tx.story.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  });

  if (!existing) {
    return baseSlug;
  }

  const entropy = crypto.randomBytes(3).toString("hex");
  const uniqueSlug = `${baseSlug.slice(0, 70)}-${entropy}`;
  return uniqueSlug;
}

/**
 * Find existing article by canonical URL.
 */
export async function findArticleByCanonicalUrl(
  canonicalUrl: string,
  client: PersistenceClient = defaultPrisma as unknown as PersistenceClient,
): Promise<{ id: string; contentHash: string; syncStatus: string; storyId: string | null } | null> {
  const record = await client.importedArticle.findUnique({
    where: { canonicalUrl },
    select: {
      id: true,
      contentHash: true,
      syncStatus: true,
      storyId: true,
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    contentHash: record.contentHash,
    syncStatus: record.syncStatus ?? "DISCOVERED",
    storyId: record.storyId,
  };
}

/**
 * Find existing article by source-scoped external ID.
 */
export async function findArticleByExternalId(
  sourceId: string,
  externalId: string,
  client: PersistenceClient = defaultPrisma as unknown as PersistenceClient,
): Promise<{ id: string; contentHash: string; syncStatus: string; storyId: string | null } | null> {
  const record = await client.importedArticle.findUnique({
    where: {
      sourceId_externalId: {
        sourceId,
        externalId,
      },
    },
    select: {
      id: true,
      contentHash: true,
      syncStatus: true,
      storyId: true,
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    contentHash: record.contentHash,
    syncStatus: record.syncStatus ?? "DISCOVERED",
    storyId: record.storyId,
  };
}

/**
 * Persist an imported article and its optional story draft in an atomic transaction.
 */
export async function persistImportedArticleRecord(
  data: PersistArticleInput,
  client: PersistenceClient = defaultPrisma as unknown as PersistenceClient,
): Promise<PersistArticleResult> {
  // Validate incoming input
  if (!data.sourceId || !data.canonicalUrl || !data.title) {
    throw new Error("Missing required article persistence fields: sourceId, canonicalUrl, and title are required.");
  }

  // Ensure storyDraft invariant: NEVER published
  if (data.storyDraft) {
    if (data.storyDraft.status !== "DRAFT" || data.storyDraft.publishedAt !== null) {
      throw new Error("Editorial invariant violated: Imported stories MUST be DRAFT with publishedAt = null.");
    }
  }

  try {
    return await client.$transaction(async (tx: DatabaseTransactionClient) => {
      let createdStoryId: string | undefined = undefined;

      // 1. Create Story Draft if provided
      if (data.storyDraft) {
        const uniqueSlug = await resolveUniqueStorySlug(data.storyDraft.slug, tx);

        const story = await tx.story.create({
          data: {
            title: data.storyDraft.title,
            slug: uniqueSlug,
            shortDescription: data.storyDraft.shortDescription,
            description: data.storyDraft.description,
            author: data.storyDraft.author,
            status: "DRAFT", // STRICT INVARIANT
            publishedAt: null, // STRICT INVARIANT
          },
          select: { id: true },
        });

        createdStoryId = story.id;
      }

      // 2. Create ImportedArticle
      const syncStatus = data.syncStatus || (data.storyDraft ? "IMPORTED" : "DISCOVERED");

      const imported = await tx.importedArticle.create({
        data: {
          sourceId: data.sourceId,
          externalId: data.externalId,
          canonicalUrl: data.canonicalUrl,
          title: data.title,
          author: data.author,
          rawPublishedAt: data.rawPublishedAt,
          summary: data.summary,
          contentHash: data.contentHash,
          syncStatus,
          storyId: createdStoryId,
        },
        select: { id: true },
      });

      logger.info("imported_article_persisted", {
        articleId: imported.id,
        storyId: createdStoryId,
        canonicalUrl: data.canonicalUrl,
        sourceId: data.sourceId,
      });

      return {
        importedArticleId: imported.id,
        storyId: createdStoryId,
        isDuplicate: false,
      };
    });
  } catch (err) {
    // Handle uniqueness collisions gracefully
    if (isUniqueConstraintViolation(err)) {
      logger.warn("imported_article_duplicate_conflict", {
        canonicalUrl: data.canonicalUrl,
        sourceId: data.sourceId,
        externalId: data.externalId,
      });

      // Find existing record by canonical URL or external ID
      let existing = await client.importedArticle.findUnique({
        where: { canonicalUrl: data.canonicalUrl },
        select: { id: true, storyId: true, contentHash: true },
      });

      if (!existing && data.externalId) {
        existing = await client.importedArticle.findUnique({
          where: {
            sourceId_externalId: {
              sourceId: data.sourceId,
              externalId: data.externalId,
            },
          },
          select: { id: true, storyId: true, contentHash: true },
        });
      }

      if (existing) {
        // Update check timestamp
        await client.importedArticle.update({
          where: { id: existing.id },
          data: { lastCheckedAt: new Date() },
        });

        return {
          importedArticleId: existing.id,
          storyId: existing.storyId ?? undefined,
          isDuplicate: true,
        };
      }
    }

    logger.error("imported_article_persist_failed", {
      canonicalUrl: data.canonicalUrl,
      sourceId: data.sourceId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Record a synchronization job run log.
 */
export async function recordSyncLogEntry(
  log: SyncLogInput,
  client: PersistenceClient = defaultPrisma as unknown as PersistenceClient,
): Promise<{ id: string }> {
  const entry = await client.newsSyncLog.create({
    data: {
      sourceId: log.sourceId ?? null,
      jobId: log.jobId,
      status: log.status,
      articlesDiscovered: log.discoveredCount,
      articlesImported: log.importedCount,
      articlesSkipped: log.skippedCount,
      articlesUpdated: 0,
      articlesWithdrawn: 0,
      errorMessage: log.errorMessage ? sanitizeSyncErrorMessage(log.errorMessage) : null,
      durationMs: log.durationMs,
      completedAt: new Date(),
    },
    select: { id: true },
  });

  logger.info("news_sync_log_recorded", {
    logId: entry.id,
    jobId: log.jobId,
    status: log.status,
    durationMs: log.durationMs,
  });

  return entry;
}

/**
 * Factory creating an implementation of the NewsDatabaseSyncPort contract.
 */
export function createNewsDatabaseSyncAdapter(
  client: PersistenceClient = defaultPrisma as unknown as PersistenceClient,
): NewsDatabaseSyncPort {
  let activeWorkerId = `sync-adapter-${crypto.randomBytes(6).toString("hex")}`;
  const lockClient = client as unknown as import("./lock").LockClient;

  return {
    async acquireSyncLock(leaseDurationMs: number): Promise<{ acquired: boolean; lockId?: string }> {
      activeWorkerId = `sync-adapter-${crypto.randomBytes(6).toString("hex")}`;
      const res = await acquireSyncLock("global_news_sync", leaseDurationMs, activeWorkerId, new Date(), lockClient);
      return {
        acquired: res.acquired,
        lockId: res.acquired ? res.lockId : undefined,
      };
    },

    async releaseSyncLock(lockId: string): Promise<boolean> {
      return releaseSyncLock(lockId, activeWorkerId, lockClient);
    },

    async findExistingArticleByCanonicalUrl(
      canonicalUrl: string,
    ): Promise<{ id: string; contentHash: string; syncStatus: string } | null> {
      const article = await findArticleByCanonicalUrl(canonicalUrl, client);
      if (!article) return null;
      return {
        id: article.id,
        contentHash: article.contentHash,
        syncStatus: article.syncStatus,
      };
    },

    async persistImportedArticle(data: PersistArticleInput): Promise<{ importedArticleId: string; storyId?: string }> {
      const res = await persistImportedArticleRecord(data, client);
      return {
        importedArticleId: res.importedArticleId,
        storyId: res.storyId,
      };
    },

    async recordSyncLog(log: {
      sourceId?: string;
      jobId: string;
      status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
      discoveredCount: number;
      importedCount: number;
      skippedCount: number;
      failedCount: number;
      durationMs: number;
    }): Promise<void> {
      await recordSyncLogEntry(
        {
          sourceId: log.sourceId,
          jobId: log.jobId,
          status: log.status,
          discoveredCount: log.discoveredCount,
          importedCount: log.importedCount,
          skippedCount: log.skippedCount,
          failedCount: log.failedCount,
          durationMs: log.durationMs,
        },
        client,
      );
    },
  };
}
