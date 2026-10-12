"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireWriteCapability } from "@/lib/auth/guards";
import { runNewsAggregationWithLock } from "@/lib/news/service";

export interface SyncActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  summary?: {
    jobId: string;
    status: string;
    sourcesProcessed: number;
    articlesDiscovered: number;
    articlesImported: number;
    articlesSkipped: number;
    articlesFailed: number;
    durationMs: number;
  };
}

const MANUAL_SYNC_COOLDOWN_MS = 60_000; // 60 seconds

/**
 * Trigger an authorized manual synchronization job.
 * Enforces server-side authorization, cooldown limits, and synchronization locking.
 * Bounded to 25 articles and 5 AI summaries per run.
 */
export async function triggerManualSyncAction(): Promise<SyncActionResult> {
  // 1. Server-side authorization check (write capability + rate budget)
  await requireWriteCapability("settings.manage", "normal");

  try {
    // 2. Cooldown check: prevent triggering if a recent job started within cooldown window
    const recentLog = await prisma.newsSyncLog.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });

    if (recentLog) {
      const elapsedMs = Date.now() - recentLog.startedAt.getTime();
      if (elapsedMs < MANUAL_SYNC_COOLDOWN_MS) {
        const remainingSec = Math.ceil((MANUAL_SYNC_COOLDOWN_MS - elapsedMs) / 1000);
        return {
          ok: false,
          error: `Synchronization is cooling down. Please wait ${remainingSec} second${remainingSec === 1 ? "" : "s"} before triggering manual sync again.`,
        };
      }
    }

    // 3. Execute synchronization job with lock and bounded limits
    const result = await runNewsAggregationWithLock({
      maxArticlesPerRun: 25,
      maxAiSummariesPerRun: 5,
    });

    if (result.status === "SKIPPED_LOCKED") {
      return {
        ok: false,
        error:
          "A synchronization job is currently in progress. Please wait for it to complete.",
      };
    }

    // 4. Invalidate admin review and sync monitoring paths
    revalidatePath("/admin/news/sync");
    revalidatePath("/admin/news/sources");
    revalidatePath("/admin/news");

    if (result.status === "FAILED") {
      return {
        ok: false,
        error:
          result.errorMessage ||
          "Synchronization job failed. Check sync monitor for details.",
        summary: result,
      };
    }

    const importedText = `${result.articlesImported} article${result.articlesImported === 1 ? "" : "s"} imported`;
    const skippedText = `${result.articlesSkipped} skipped`;
    const message = `Sync completed (${result.status}): ${importedText}, ${skippedText} from ${result.sourcesProcessed} active sources.`;

    return {
      ok: true,
      message,
      summary: result,
    };
  } catch (_err) {
    return {
      ok: false,
      error: "An unexpected error occurred during manual synchronization.",
    };
  }
}
