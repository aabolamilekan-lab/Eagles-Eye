import { describe, expect, it, vi } from "vitest";
import type { NewsAggregationJobSummary } from "@/lib/news/service";

const TEST_SECRET = "test-cron-secret-long-enough-32-chars";

let mockJobSummary: NewsAggregationJobSummary = {
  jobId: "sync-job-123",
  status: "SUCCESS",
  sourcesProcessed: 1,
  articlesDiscovered: 2,
  articlesImported: 2,
  articlesSkipped: 0,
  articlesFailed: 0,
  durationMs: 450,
};

// Top-level hoisted mocks
vi.mock("@/lib/news/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/news/service")>();
  return {
    ...original,
    runNewsAggregationWithLock: vi.fn(async () => mockJobSummary),
  };
});

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...original,
    getEnv: vi.fn(() => ({
      CRON_SECRET: TEST_SECRET,
      NEWS_AUTO_PUBLISH: "false",
    })),
  };
});

// Import route handlers after mocks
import { GET, POST } from "@/app/api/cron/aggregate/route";
import { runNewsAggregationWithLock } from "@/lib/news/service";
import { getEnv, type Env } from "@/lib/env";

describe("News Cron Route Handler (/api/cron/aggregate)", () => {
  it("rejects request with 401 when Authorization header is absent", async () => {
    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("rejects request with 401 when token does not match CRON_SECRET", async () => {
    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "GET",
      headers: {
        authorization: "Bearer wrong-token-not-matching-secret-key",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("rejects request with 401 when CRON_SECRET is not configured in env", async () => {
    vi.mocked(getEnv).mockReturnValueOnce({
      CRON_SECRET: undefined,
      NEWS_AUTO_PUBLISH: "false",
    } as unknown as Env);

    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "GET",
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("executes successfully on authorized GET request (Vercel Cron invocation)", async () => {
    mockJobSummary = {
      jobId: "sync-job-123",
      status: "SUCCESS",
      sourcesProcessed: 1,
      articlesDiscovered: 2,
      articlesImported: 2,
      articlesSkipped: 0,
      articlesFailed: 0,
      durationMs: 450,
    };

    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "GET",
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe("SUCCESS");
    expect(data.articlesImported).toBe(2);
  });

  it("supports authorized POST request for manual administrative trigger", async () => {
    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns HTTP 200 with skipped_locked when another worker holds the lock", async () => {
    mockJobSummary = {
      jobId: "sync-contended",
      status: "SKIPPED_LOCKED",
      sourcesProcessed: 0,
      articlesDiscovered: 0,
      articlesImported: 0,
      articlesSkipped: 0,
      articlesFailed: 0,
      durationMs: 0,
    };

    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "GET",
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe("skipped_locked");
    expect(data.message).toContain("Job skipped: another worker is actively processing");
  });

  it("returns HTTP 500 without leaking stack traces or secrets on unhandled failure", async () => {
    vi.mocked(runNewsAggregationWithLock).mockRejectedValueOnce(
      new Error("Database connection pool timeout with credentials secret-leak-attempt"),
    );

    const req = new Request("http://localhost:3000/api/cron/aggregate", {
      method: "GET",
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toEqual({ ok: false, error: "Internal Server Error" });
    // Zero secret or stack trace leakage
    expect(JSON.stringify(data)).not.toContain("secret-leak-attempt");
  });
});
