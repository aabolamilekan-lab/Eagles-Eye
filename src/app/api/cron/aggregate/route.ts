import "server-only";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  runNewsAggregationWithLock,
  verifyCronAuthorization,
} from "@/lib/news/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds (Vercel Hobby plan limit)

export async function handleCronRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");

  let cronSecret: string | undefined;
  try {
    const env = getEnv();
    cronSecret = env.CRON_SECRET;
  } catch (err) {
    logger.error("news_cron_env_read_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Timing-safe authorization check
  if (!verifyCronAuthorization(authHeader, cronSecret)) {
    logger.warn("news_cron_unauthorized_attempt", {
      hasAuthHeader: Boolean(authHeader),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runNewsAggregationWithLock();

    if (summary.status === "SKIPPED_LOCKED") {
      logger.info("news_cron_skipped_active_lock", { jobId: summary.jobId });
      return NextResponse.json(
        {
          ok: true,
          status: "skipped_locked",
          message: "Job skipped: another worker is actively processing news synchronization.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        ...summary,
      },
      { status: 200 },
    );
  } catch (err) {
    logger.error("news_cron_unhandled_failure", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * Primary handler invoked by Vercel Cron.
 */
export async function GET(req: Request): Promise<Response> {
  return handleCronRequest(req);
}

/**
 * Secondary handler for authorized administrative or manual triggers.
 */
export async function POST(req: Request): Promise<Response> {
  return handleCronRequest(req);
}
