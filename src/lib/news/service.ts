import "server-only";
import crypto from "node:crypto";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fetchSafeUrl } from "./ssrf";
import { parseFeedXml } from "./parser";
import { coordinateAggregationRun } from "./aggregator";
import {
  persistImportedArticleRecord,
  recordSyncLogEntry,
  type PersistenceClient,
} from "./persistence";
import { renewSyncLock, withSyncLock, type LockClient } from "./lock";
import { sanitizeSyncErrorMessage } from "./sanitizer";
import type { GeminiSummarizeInput, GeminiSummarizeResult } from "./types";

export interface NewsSourceEntity {
  id: string;
  name: string;
  feedUrl: string;
  etag: string | null;
  lastModified: string | null;
  consecutiveFailures: number;
}

export interface NewsServiceDbClient {
  newsSource: {
    findMany: (args: {
      where: { isActive: boolean };
      select: Record<string, boolean>;
    }) => Promise<NewsSourceEntity[]>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export interface NewsAggregationJobOptions {
  jobId?: string;
  now?: Date;
  client?: PersistenceClient & NewsServiceDbClient;
  lockClient?: LockClient;
  lockContext?: {
    lockId: string;
    workerId: string;
    leaseExpiresAt?: Date;
  };
  leaseDurationMs?: number;
  fetchFeedFn?: (
    url: string,
    etag?: string,
    lastModified?: string,
  ) => Promise<{
    status: number;
    body: string;
    etag?: string;
    lastModified?: string;
  }>;
  summarizeFn?: (input: GeminiSummarizeInput) => Promise<GeminiSummarizeResult>;
  maxArticlesPerRun?: number;
  maxAiSummariesPerRun?: number;
}

export interface NewsAggregationJobSummary {
  jobId: string;
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED_LOCKED" | "NO_SOURCES";
  sourcesProcessed: number;
  articlesDiscovered: number;
  articlesImported: number;
  articlesSkipped: number;
  articlesFailed: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Validate incoming Authorization header against CRON_SECRET using constant-time comparison.
 */
export function verifyCronAuthorization(
  authHeader: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (
    !authHeader ||
    !expectedSecret ||
    typeof expectedSecret !== "string" ||
    expectedSecret.trim() === ""
  ) {
    return false;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return false;
  }

  const tokenBuffer = Buffer.from(token, "utf8");
  const expectedBuffer = Buffer.from(expectedSecret, "utf8");

  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

/**
 * Core news aggregation job executor.
 *
 * Iterates active news sources, fetches feeds securely (SSRF-protected),
 * scores and deduplicates candidates, generates grounded summaries,
 * and persists draft stories inside atomic transactions.
 */
export async function executeNewsAggregationJob(
  options: NewsAggregationJobOptions = {},
): Promise<NewsAggregationJobSummary> {
  const start = Date.now();
  const now = options.now ?? new Date();
  const jobId = options.jobId ?? `sync-job-${crypto.randomBytes(6).toString("hex")}`;
  const client =
    options.client ??
    (defaultPrisma as unknown as PersistenceClient & NewsServiceDbClient);

  const fetchFeedFn =
    options.fetchFeedFn ??
    (async (url: string, etag?: string, lastModified?: string) => {
      return fetchSafeUrl(url, { etag, lastModified });
    });

  logger.info("news_aggregation_job_started", { jobId });

  // 1. Fetch active news sources
  let sources: NewsSourceEntity[] = [];
  try {
    sources = await client.newsSource.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        feedUrl: true,
        etag: true,
        lastModified: true,
        consecutiveFailures: true,
      },
    });
  } catch (err) {
    logger.error("news_aggregation_fetch_sources_failed", {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      jobId,
      status: "FAILED",
      sourcesProcessed: 0,
      articlesDiscovered: 0,
      articlesImported: 0,
      articlesSkipped: 0,
      articlesFailed: 0,
      durationMs: Date.now() - start,
      errorMessage: sanitizeSyncErrorMessage(
        err instanceof Error ? err.message : String(err),
      ),
    };
  }

  if (sources.length === 0) {
    logger.info("news_aggregation_no_active_sources", { jobId });
    return {
      jobId,
      status: "NO_SOURCES",
      sourcesProcessed: 0,
      articlesDiscovered: 0,
      articlesImported: 0,
      articlesSkipped: 0,
      articlesFailed: 0,
      durationMs: Date.now() - start,
    };
  }

  let totalDiscovered = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let sourcesProcessed = 0;

  for (const source of sources) {
    // Lock fencing & heartbeat renewal: verify lease is active and extend before processing source
    if (options.lockContext && options.lockClient) {
      const isRenewed = await renewSyncLock(
        options.lockContext.lockId,
        options.lockContext.workerId,
        options.leaseDurationMs ?? 60_000,
        new Date(),
        options.lockClient,
      );

      if (!isRenewed) {
        logger.warn("news_sync_lock_fencing_aborted", {
          jobId,
          workerId: options.lockContext.workerId,
          sourceId: source.id,
          reason:
            "Lock lease lost or expired. Aborting remaining sources to prevent stale writes.",
        });
        totalFailed += 1;
        break;
      }
    }

    const sourceStart = Date.now();
    try {
      // 2. Outbound feed fetch (SSRF-guarded)
      const fetchRes = await fetchFeedFn(
        source.feedUrl,
        source.etag ?? undefined,
        source.lastModified ?? undefined,
      );

      // Handle 304 Not Modified
      if (fetchRes.status === 304) {
        await client.newsSource.update({
          where: { id: source.id },
          data: {
            lastFetchedAt: now,
            lastSuccessAt: now,
            consecutiveFailures: 0,
            lastErrorMessage: null,
          },
        });
        sourcesProcessed += 1;
        continue;
      }

      if (fetchRes.status !== 200 || !fetchRes.body) {
        throw new Error(`Feed fetch returned HTTP status ${fetchRes.status}`);
      }

      // 3. XML Parsing
      const parsedFeed = parseFeedXml(fetchRes.body);

      // 4. Scoring, Deduplication & AI summarization
      const batch = {
        sourceId: source.id,
        sourceName: source.name,
        items: parsedFeed.items,
      };

      const runSummary = await coordinateAggregationRun([batch], {
        now,
        maxArticlesPerRun: options.maxArticlesPerRun ?? 25,
        maxAiSummariesPerRun: options.maxAiSummariesPerRun ?? 5,
        summarizeFn: options.summarizeFn,
      });

      totalDiscovered += runSummary.totalDiscovered;

      let sourceImported = 0;
      let sourceSkipped = 0;
      let sourceFailed = 0;

      // 5. Transactional Persistence
      for (const res of runSummary.results) {
        if (res.status === "SUMMARIZED" && res.storyDraft) {
          try {
            const persistRes = await persistImportedArticleRecord(
              {
                sourceId: source.id,
                externalId: res.candidate.externalId,
                canonicalUrl: res.candidate.canonicalUrl,
                title: res.candidate.title,
                author: res.candidate.author,
                rawPublishedAt: res.candidate.rawPublishedAt,
                summary: res.candidate.summary,
                contentHash: res.candidate.contentHash,
                storyDraft: res.storyDraft, // ALWAYS DRAFT
              },
              client,
            );

            if (persistRes.isDuplicate) {
              sourceSkipped += 1;
            } else {
              sourceImported += 1;
            }
          } catch (persistErr) {
            sourceFailed += 1;
            logger.warn("news_aggregation_persist_item_failed", {
              jobId,
              canonicalUrl: res.candidate.canonicalUrl,
              error:
                persistErr instanceof Error
                  ? persistErr.message
                  : String(persistErr),
            });
          }
        } else {
          sourceSkipped += 1;
        }
      }

      totalImported += sourceImported;
      totalSkipped += sourceSkipped;
      totalFailed += sourceFailed;

      // 6. Update source telemetry & record sync log
      await client.newsSource.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: now,
          lastSuccessAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
          consecutiveFailures: 0,
          etag: fetchRes.etag ?? null,
          lastModified: fetchRes.lastModified ?? null,
        },
      });

      await recordSyncLogEntry(
        {
          sourceId: source.id,
          jobId,
          status: sourceFailed > 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
          discoveredCount: runSummary.totalDiscovered,
          importedCount: sourceImported,
          skippedCount: sourceSkipped,
          failedCount: sourceFailed,
          durationMs: Date.now() - sourceStart,
        },
        client,
      );

      sourcesProcessed += 1;
    } catch (sourceErr) {
      totalFailed += 1;
      const errMsg =
        sourceErr instanceof Error ? sourceErr.message : String(sourceErr);

      logger.error("news_aggregation_source_failed", {
        jobId,
        sourceId: source.id,
        error: errMsg,
      });

      try {
        await client.newsSource.update({
          where: { id: source.id },
          data: {
            lastFetchedAt: now,
            lastErrorAt: now,
            lastErrorMessage: sanitizeSyncErrorMessage(errMsg),
            consecutiveFailures: { increment: 1 },
          },
        });

        await recordSyncLogEntry(
          {
            sourceId: source.id,
            jobId,
            status: "FAILED",
            discoveredCount: 0,
            importedCount: 0,
            skippedCount: 0,
            failedCount: 1,
            errorMessage: sanitizeSyncErrorMessage(errMsg),
            durationMs: Date.now() - sourceStart,
          },
          client,
        );
      } catch {
        // Silently preserve primary error
      }
    }
  }

  const durationMs = Date.now() - start;
  const overallStatus =
    totalFailed > 0 && totalImported === 0
      ? "FAILED"
      : totalFailed > 0
        ? "PARTIAL_SUCCESS"
        : "SUCCESS";

  logger.info("news_aggregation_job_completed", {
    jobId,
    status: overallStatus,
    sourcesProcessed,
    totalDiscovered,
    totalImported,
    totalSkipped,
    totalFailed,
    durationMs,
  });

  return {
    jobId,
    status: overallStatus,
    sourcesProcessed,
    articlesDiscovered: totalDiscovered,
    articlesImported: totalImported,
    articlesSkipped: totalSkipped,
    articlesFailed: totalFailed,
    durationMs,
  };
}

/**
 * Execute news aggregation protected by distributed synchronization lock.
 * Ensures concurrent cron workers or manual triggers do not overlap.
 */
export async function runNewsAggregationWithLock(
  options: NewsAggregationJobOptions = {},
): Promise<NewsAggregationJobSummary> {
  const lockClient =
    options.lockClient ??
    (options.client as unknown as LockClient) ??
    (defaultPrisma as unknown as LockClient);

  const leaseDurationMs = options.leaseDurationMs ?? 60_000;

  const lockRes = await withSyncLock(
    async (context) => {
      return executeNewsAggregationJob({
        ...options,
        lockClient,
        lockContext: {
          lockId: context.lockId,
          workerId: context.workerId,
          leaseExpiresAt: context.leaseExpiresAt,
        },
        leaseDurationMs,
      });
    },
    {
      lockId: "global_news_sync",
      leaseDurationMs,
      client: lockClient,
    },
  );

  if (!lockRes.executed) {
    return {
      jobId: options.jobId ?? "none",
      status: "SKIPPED_LOCKED",
      sourcesProcessed: 0,
      articlesDiscovered: 0,
      articlesImported: 0,
      articlesSkipped: 0,
      articlesFailed: 0,
      durationMs: 0,
      errorMessage:
        lockRes.reason ||
        "Aggregation job skipped: lock is already held by another active worker.",
    };
  }

  return lockRes.result!;
}
