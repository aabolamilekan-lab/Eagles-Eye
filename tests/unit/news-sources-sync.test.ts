import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const {
  mockRequireWriteCapability,
  mockRevalidatePath,
  mockNewsSources,
  mockNewsSyncLogs,
  mockNewsSyncLock,
  mockPrisma,
} = vi.hoisted(() => {
  interface MockNewsSource {
    id: string;
    name: string;
    slug: string;
    feedUrl: string;
    feedType: string;
    isActive: boolean;
    attributionPolicy: string | null;
    consecutiveFailures: number;
    lastFetchedAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorMessage: string | null;
  }

  interface MockNewsSyncLog {
    id: string;
    jobId: string;
    sourceId: string | null;
    status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
    articlesDiscovered: number;
    articlesImported: number;
    articlesSkipped: number;
    errorMessage: string | null;
    durationMs: number;
    startedAt: Date;
    completedAt: Date | null;
  }

  interface MockNewsSyncLock {
    id: string;
    lockedUntil: Date | null;
    lockedBy: string | null;
  }

  const mockNewsSources = new Map<string, MockNewsSource>();
  const mockNewsSyncLogs: MockNewsSyncLog[] = [];
  const mockNewsSyncLock: MockNewsSyncLock = {
    id: "global_news_sync",
    lockedUntil: null,
    lockedBy: null,
  };

  const mockRequireWriteCapability = vi.fn();
  const mockRevalidatePath = vi.fn();

  const mockPrisma = {
    newsSource: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockNewsSources.get(where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { isActive?: boolean } }) => {
        const all = Array.from(mockNewsSources.values());
        if (where?.isActive !== undefined) {
          return all.filter((s) => s.isActive === where.isActive);
        }
        return all;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockNewsSource>;
        }) => {
          const existing = mockNewsSources.get(where.id);
          if (!existing) throw new Error("Source not found");
          const updated = { ...existing, ...data };
          mockNewsSources.set(where.id, updated);
          return updated;
        },
      ),
    },
    newsSyncLog: {
      findFirst: vi.fn(async () => {
        if (mockNewsSyncLogs.length === 0) return null;
        // latest first
        return mockNewsSyncLogs[mockNewsSyncLogs.length - 1];
      }),
      findMany: vi.fn(async () => {
        return [...mockNewsSyncLogs].reverse();
      }),
      count: vi.fn(async () => mockNewsSyncLogs.length),
      create: vi.fn(async ({ data }: { data: Omit<MockNewsSyncLog, "id"> }) => {
        const id = `log-${mockNewsSyncLogs.length + 1}`;
        const record = { id, ...data };
        mockNewsSyncLogs.push(record as MockNewsSyncLog);
        return { id };
      }),
    },
    newsSyncLock: {
      findUnique: vi.fn(async () => mockNewsSyncLock),
      upsert: vi.fn(async () => mockNewsSyncLock),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
            lockedBy?: string;
            lockedUntil?: { gte?: Date; lt?: Date };
            OR?: Array<{ lockedUntil: null | { lt: Date } }>;
          };
          data: { lockedUntil: Date | null; lockedBy?: string | null };
        }) => {
          const now = new Date();
          // Check ownership
          if (where.lockedBy !== undefined && where.lockedBy !== mockNewsSyncLock.lockedBy) {
            return { count: 0 };
          }
          // Check renewal constraint
          if (where.lockedUntil?.gte !== undefined) {
            if (
              !mockNewsSyncLock.lockedUntil ||
              mockNewsSyncLock.lockedUntil.getTime() < where.lockedUntil.gte.getTime()
            ) {
              return { count: 0 };
            }
          }
          // Check acquisition condition
          if (where.OR) {
            const isNull = mockNewsSyncLock.lockedUntil === null;
            const isExpired =
              mockNewsSyncLock.lockedUntil !== null &&
              mockNewsSyncLock.lockedUntil.getTime() < now.getTime();
            if (!isNull && !isExpired) {
              return { count: 0 };
            }
          }

          mockNewsSyncLock.lockedUntil = data.lockedUntil;
          if (data.lockedBy !== undefined) {
            mockNewsSyncLock.lockedBy = data.lockedBy;
          }
          return { count: 1 };
        },
      ),
    },
  };

  return {
    mockRequireWriteCapability,
    mockRevalidatePath,
    mockNewsSources,
    mockNewsSyncLogs,
    mockNewsSyncLock,
    mockPrisma,
  };
});

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: vi.fn(),
  requireWriteCapability: (...args: unknown[]) => mockRequireWriteCapability(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

// Mock news service for Server Action tests
const mockRunNewsAggregationWithLock = vi.fn();
vi.mock("@/lib/news/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/news/service")>();
  return {
    ...original,
    runNewsAggregationWithLock: (...args: unknown[]) =>
      mockRunNewsAggregationWithLock(...args),
  };
});

// Import after mocks
import { toggleNewsSourceAction } from "@/actions/news-sources";
import { triggerManualSyncAction } from "@/actions/news-sync";
import { sanitizeSyncErrorMessage } from "@/lib/news/sanitizer";
import {
  acquireSyncLock,
  generateWorkerId,
  renewSyncLock,
} from "@/lib/news/lock";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, val] of Object.entries(entries)) {
    fd.set(key, val);
  }
  return fd;
}

describe("News Sources Management and Sync Monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWriteCapability.mockResolvedValue({ userId: "admin-1" });

    mockNewsSources.clear();
    mockNewsSources.set("source-nasa", {
      id: "source-nasa",
      name: "NASA Breaking News",
      slug: "nasa-breaking-news",
      feedUrl: "https://www.nasa.gov/news-release/feed/",
      feedType: "RSS",
      isActive: true,
      attributionPolicy: "NASA Media Guidelines",
      consecutiveFailures: 0,
      lastFetchedAt: new Date("2026-10-12T12:00:00Z"),
      lastSuccessAt: new Date("2026-10-12T12:00:00Z"),
      lastErrorAt: null,
      lastErrorMessage: null,
    });
    mockNewsSources.set("source-unverified", {
      id: "source-unverified",
      name: "Unverified Feed",
      slug: "unverified-feed",
      feedUrl: "ftp://unsafe-protocol.example/feed.xml",
      feedType: "RSS",
      isActive: false,
      attributionPolicy: null,
      consecutiveFailures: 0,
      lastFetchedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    });

    mockNewsSyncLogs.length = 0;
    mockNewsSyncLock.lockedUntil = null;
    mockNewsSyncLock.lockedBy = null;
  });

  describe("1. Unauthorized access and actions", () => {
    it("rejects toggleNewsSourceAction when caller lacks capability", async () => {
      mockRequireWriteCapability.mockRejectedValueOnce(new Error("Unauthorized: forbidden"));

      const fd = makeFormData({
        sourceId: "source-nasa",
        active: "false",
      });

      await expect(toggleNewsSourceAction(fd)).rejects.toThrow("Unauthorized");
      expect(mockRequireWriteCapability).toHaveBeenCalledWith("settings.manage", "normal");
    });

    it("rejects triggerManualSyncAction when caller lacks capability", async () => {
      mockRequireWriteCapability.mockRejectedValueOnce(new Error("Unauthorized: forbidden"));

      await expect(triggerManualSyncAction()).rejects.toThrow("Unauthorized");
      expect(mockRequireWriteCapability).toHaveBeenCalledWith("settings.manage", "normal");
    });
  });

  describe("2. Source activation and deactivation", () => {
    it("deactivates an active source successfully", async () => {
      const fd = makeFormData({
        sourceId: "source-nasa",
        active: "false",
      });

      const result = await toggleNewsSourceAction(fd);

      expect(result.ok).toBe(true);
      expect(result.isActive).toBe(false);
      expect(mockNewsSources.get("source-nasa")?.isActive).toBe(false);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/news/sources");
    });

    it("activates an eligible, verified source successfully", async () => {
      mockNewsSources.get("source-nasa")!.isActive = false;

      const fd = makeFormData({
        sourceId: "source-nasa",
        active: "true",
      });

      const result = await toggleNewsSourceAction(fd);

      expect(result.ok).toBe(true);
      expect(result.isActive).toBe(true);
      expect(mockNewsSources.get("source-nasa")?.isActive).toBe(true);
    });

    it("refuses to activate an unverified source missing HTTP(S) protocol", async () => {
      const fd = makeFormData({
        sourceId: "source-unverified",
        active: "true",
      });

      const result = await toggleNewsSourceAction(fd);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("valid HTTP(S) feed URL");
      expect(mockNewsSources.get("source-unverified")?.isActive).toBe(false);
    });

    it("refuses to activate a source with missing attribution policy", async () => {
      mockNewsSources.set("source-no-policy", {
        id: "source-no-policy",
        name: "No Policy Source",
        slug: "no-policy-source",
        feedUrl: "https://example.com/feed.xml",
        feedType: "RSS",
        isActive: false,
        attributionPolicy: null,
        consecutiveFailures: 0,
        lastFetchedAt: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorMessage: null,
      });

      const fd = makeFormData({
        sourceId: "source-no-policy",
        active: "true",
      });

      const result = await toggleNewsSourceAction(fd);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("defined attribution policy");
      expect(mockNewsSources.get("source-no-policy")?.isActive).toBe(false);
    });
  });

  describe("3. Lock contention, expiration, and renewal fencing", () => {
    it("reports lock contention when another worker holds active lease", async () => {
      mockRunNewsAggregationWithLock.mockResolvedValueOnce({
        jobId: "none",
        status: "SKIPPED_LOCKED",
        sourcesProcessed: 0,
        articlesDiscovered: 0,
        articlesImported: 0,
        articlesSkipped: 0,
        articlesFailed: 0,
        durationMs: 0,
        errorMessage: "Lock is currently active and held by another concurrent worker.",
      });

      const result = await triggerManualSyncAction();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("A synchronization job is currently in progress");
    });

    it("reclaims lock when existing lease has expired", async () => {
      // Lease expired in the past
      mockNewsSyncLock.lockedUntil = new Date("2026-10-12T11:00:00Z");
      mockNewsSyncLock.lockedBy = "stale-dead-worker";

      const workerId = generateWorkerId("new-worker");
      const acquisition = await acquireSyncLock(
        "global_news_sync",
        60_000,
        workerId,
        new Date("2026-10-12T12:00:00Z"),
        mockPrisma as unknown as import("@/lib/news/lock").LockClient,
      );

      expect(acquisition.acquired).toBe(true);
      expect(mockNewsSyncLock.lockedBy).toBe(workerId);
    });

    it("allows active worker to renew lock, but rejects renewal from stale worker", async () => {
      mockNewsSyncLock.lockedUntil = new Date("2026-10-12T12:01:00Z");
      mockNewsSyncLock.lockedBy = "worker-active-1";

      const now = new Date("2026-10-12T12:00:30Z");

      // Active owner renews successfully
      const renewed = await renewSyncLock(
        "global_news_sync",
        "worker-active-1",
        60_000,
        now,
        mockPrisma as unknown as import("@/lib/news/lock").LockClient,
      );
      expect(renewed).toBe(true);

      // Stale worker tries to renew and gets fenced out
      const staleRenewed = await renewSyncLock(
        "global_news_sync",
        "worker-stale-old",
        60_000,
        now,
        mockPrisma as unknown as import("@/lib/news/lock").LockClient,
      );
      expect(staleRenewed).toBe(false);
    });
  });

  describe("4. Cooldown and workload limits", () => {
    it("enforces 60-second cooldown between manual sync triggers", async () => {
      // Record a log from 20 seconds ago
      mockNewsSyncLogs.push({
        id: "log-recent",
        jobId: "job-recent",
        sourceId: null,
        status: "SUCCESS",
        articlesDiscovered: 5,
        articlesImported: 2,
        articlesSkipped: 3,
        errorMessage: null,
        durationMs: 1200,
        startedAt: new Date(Date.now() - 20_000), // 20s ago
        completedAt: new Date(),
      });

      const result = await triggerManualSyncAction();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("cooling down");
      expect(mockRunNewsAggregationWithLock).not.toHaveBeenCalled();
    });

    it("passes bounded limits (25 articles, 5 AI summaries) to sync runner", async () => {
      mockRunNewsAggregationWithLock.mockResolvedValueOnce({
        jobId: "job-fresh",
        status: "SUCCESS",
        sourcesProcessed: 1,
        articlesDiscovered: 4,
        articlesImported: 2,
        articlesSkipped: 2,
        articlesFailed: 0,
        durationMs: 850,
      });

      const result = await triggerManualSyncAction();

      expect(result.ok).toBe(true);
      expect(mockRunNewsAggregationWithLock).toHaveBeenCalledWith({
        maxArticlesPerRun: 25,
        maxAiSummariesPerRun: 5,
      });
      expect(result.message).toContain("Sync completed (SUCCESS): 2 articles imported");
    });
  });

  describe("5. Error sanitization", () => {
    it("redacts database connection strings and passwords", () => {
      const sensitiveErr =
        "Failed to connect: postgresql://admin:supersecretpassword@db.prod.internal:5432/eagles_eye";
      const sanitized = sanitizeSyncErrorMessage(sensitiveErr);

      expect(sanitized).not.toContain("supersecretpassword");
      expect(sanitized).not.toContain("admin:supersecretpassword@");
      expect(sanitized).toContain("[REDACTED_DATABASE_URL]");
    });

    it("redacts authorization bearer tokens and API keys", () => {
      const errWithTokens =
        "Remote feed rejected with 401: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123 and api_key=secret-gemini-key";
      const sanitized = sanitizeSyncErrorMessage(errWithTokens);

      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(sanitized).not.toContain("secret-gemini-key");
      expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
      expect(sanitized).toContain("api_key=[REDACTED]");
    });

    it("redacts local file paths and truncates oversized messages", () => {
      const longErrMsg = `Error in C:\\Users\\Administrator\\Desktop\\secrets\\keys.json: ${"A".repeat(600)}`;
      const sanitized = sanitizeSyncErrorMessage(longErrMsg);

      expect(sanitized).not.toContain("C:\\Users\\Administrator");
      expect(sanitized).toContain("[REDACTED_PATH]");
      expect(sanitized.length).toBeLessThanOrEqual(500);
      expect(sanitized.endsWith("...")).toBe(true);
    });
  });

  describe("6. Reporting synchronization failures clearly", () => {
    it("does not falsely mark failed runs as successful", async () => {
      mockRunNewsAggregationWithLock.mockResolvedValueOnce({
        jobId: "job-fail",
        status: "FAILED",
        sourcesProcessed: 0,
        articlesDiscovered: 0,
        articlesImported: 0,
        articlesSkipped: 0,
        articlesFailed: 2,
        durationMs: 400,
        errorMessage: "Feed unreachable: DNS resolution timeout",
      });

      const result = await triggerManualSyncAction();

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Feed unreachable: DNS resolution timeout");
      expect(result.summary?.status).toBe("FAILED");
    });
  });
});
