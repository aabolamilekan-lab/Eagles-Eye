import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleSyncStatus, ContentStatus } from "@prisma/client";

// Hoisted mocks and shared state
const {
  mockRequireWriteCapability,
  mockRevalidatePath,
  mockRevalidateTag,
  mockRevalidatePublicStoryCaches,
  mockCategories,
  mockStories,
  mockImportedArticles,
  mockPrisma,
} = vi.hoisted(() => {
  interface MockStory {
    id: string;
    slug: string;
    title: string;
    author: string | null;
    shortDescription: string | null;
    description: string | null;
    status: ContentStatus;
    publishedAt: Date | null;
    updatedAt: Date;
    categoryId: string | null;
    importedArticles?: Array<{ id: string; syncStatus: ArticleSyncStatus }>;
  }

  interface MockImportedArticle {
    id: string;
    syncStatus: ArticleSyncStatus;
    canonicalUrl: string;
    contentHash: string;
  }

  interface MockCategory {
    id: string;
    name: string;
    slug: string;
  }

  const mockCategories = new Map<string, MockCategory>();
  const mockStories = new Map<string, MockStory>();
  const mockImportedArticles = new Map<string, MockImportedArticle>();

  const mockRequireWriteCapability = vi.fn();
  const mockRevalidatePath = vi.fn();
  const mockRevalidateTag = vi.fn();
  const mockRevalidatePublicStoryCaches = vi.fn();

  const mockPrisma = {
    category: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockCategories.get(where.id) ?? null;
      }),
    },
    story: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const s = mockStories.get(where.id);
        if (!s) return null;
        return {
          ...s,
          importedArticles: s.importedArticles ?? [],
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockStory> }) => {
        const existing = mockStories.get(where.id);
        if (!existing) throw new Error("Story not found");
        const updated: MockStory = {
          ...existing,
          ...data,
          updatedAt: new Date("2026-10-12T16:00:00Z"),
        };
        mockStories.set(where.id, updated);
        return updated;
      }),
    },
    importedArticle: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockImportedArticle> }) => {
        const existing = mockImportedArticles.get(where.id);
        if (!existing) throw new Error("ImportedArticle not found");
        const updated: MockImportedArticle = {
          ...existing,
          ...data,
        };
        mockImportedArticles.set(where.id, updated);
        return updated;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(mockPrisma);
    }),
  };

  return {
    mockRequireWriteCapability,
    mockRevalidatePath,
    mockRevalidateTag,
    mockRevalidatePublicStoryCaches,
    mockCategories,
    mockStories,
    mockImportedArticles,
    mockPrisma,
  };
});

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: vi.fn(),
  requireWriteCapability: (...args: unknown[]) => mockRequireWriteCapability(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/stories/revalidate", () => ({
  revalidatePublicStoryCaches: (...args: unknown[]) => mockRevalidatePublicStoryCaches(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

// Import after mocks
import {
  approveAndPublishNewsAction,
  rejectNewsDraftAction,
  saveNewsDraftAction,
} from "@/actions/news-editorial";
import { PUBLIC_STORY_WHERE, buildStoryListWhere } from "@/lib/queries/public/story-filter";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, val] of Object.entries(entries)) {
    fd.set(key, val);
  }
  return fd;
}

describe("News Editorial Workflow Actions", () => {
  const initialUpdatedAt = new Date("2026-10-12T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWriteCapability.mockResolvedValue({ userId: "admin-1" });

    mockCategories.clear();
    mockCategories.set("cat-tech", {
      id: "cat-tech",
      name: "Technology & Science",
      slug: "technology-science",
    });
    mockCategories.set("cat-world", {
      id: "cat-world",
      name: "World News",
      slug: "world-news",
    });

    mockImportedArticles.clear();
    mockImportedArticles.set("art-1", {
      id: "art-1",
      syncStatus: ArticleSyncStatus.IMPORTED,
      canonicalUrl: "https://example.com/nasa-report",
      contentHash: "hash-12345",
    });

    mockStories.clear();
    mockStories.set("story-1", {
      id: "story-1",
      slug: "nasa-breakthrough-2026",
      title: "NASA Unveils Next-Gen Space Telescope Milestone",
      author: "NASA Reporter",
      shortDescription: "A comprehensive summary of the space breakthrough.",
      description: "<p>Original synthesized reporting on space exploration.</p>",
      status: ContentStatus.DRAFT,
      publishedAt: null,
      updatedAt: initialUpdatedAt,
      categoryId: "cat-tech",
      importedArticles: [{ id: "art-1", syncStatus: ArticleSyncStatus.IMPORTED }],
    });
  });

  describe("1. State transitions", () => {
    it("preserves DRAFT status and publishedAt null on draft saves", async () => {
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Updated Title for Draft",
        author: "Lead Editor",
        shortDescription: "Updated short description",
        description: "<p>Safe editorial draft content</p>",
        categoryId: "cat-tech",
      });

      const result = await saveNewsDraftAction(fd);

      expect(result.ok).toBe(true);
      const saved = mockStories.get("story-1");
      expect(saved?.status).toBe(ContentStatus.DRAFT);
      expect(saved?.publishedAt).toBeNull();
      expect(saved?.title).toBe("Updated Title for Draft");
      expect(saved?.author).toBe("Lead Editor");
    });

    it("rejects draft saves on non-draft stories", async () => {
      const story = mockStories.get("story-1")!;
      story.status = ContentStatus.PUBLISHED;
      story.publishedAt = new Date();

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Trying to edit published news",
      });

      const result = await saveNewsDraftAction(fd);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Only draft stories can be saved as drafts");
    });

    it("transitions DRAFT to PUBLISHED and sets publishedAt on approve and publish", async () => {
      const beforeTime = new Date();
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Ready to Publish Headline",
        author: "Eagles Eye Staff",
        shortDescription: "Verified short description",
        description: "<p>Approved narrative story body.</p>",
        categoryId: "cat-tech",
      });

      const result = await approveAndPublishNewsAction(fd);

      expect(result.ok).toBe(true);
      const published = mockStories.get("story-1");
      expect(published?.status).toBe(ContentStatus.PUBLISHED);
      expect(published?.publishedAt).toBeInstanceOf(Date);
      expect(published?.publishedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());

      // ImportedArticle syncStatus remains IMPORTED
      const linkedArticle = mockImportedArticles.get("art-1");
      expect(linkedArticle?.syncStatus).toBe(ArticleSyncStatus.IMPORTED);
    });

    it("forbids publishing a story that is already PUBLISHED or ARCHIVED", async () => {
      const story = mockStories.get("story-1")!;
      story.status = ContentStatus.PUBLISHED;

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Cannot publish twice",
        author: "Author",
        shortDescription: "Valid short description",
        description: "<p>Valid description content</p>",
        categoryId: "cat-tech",
      });

      const result = await approveAndPublishNewsAction(fd);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Only draft stories can be published");

      story.status = ContentStatus.ARCHIVED;
      const resultArchived = await approveAndPublishNewsAction(fd);
      expect(resultArchived.ok).toBe(false);
      expect(resultArchived.error).toContain("Only draft stories can be published");
    });

    it("transitions DRAFT to ARCHIVED and sets ImportedArticle syncStatus to FILTERED on reject", async () => {
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        reason: "Off-topic syndicate feed",
      });

      const result = await rejectNewsDraftAction(fd);

      expect(result.ok).toBe(true);
      const archivedStory = mockStories.get("story-1");
      expect(archivedStory?.status).toBe(ContentStatus.ARCHIVED);
      expect(archivedStory?.publishedAt).toBeNull();

      // Linked ImportedArticle transitioned to FILTERED to prevent duplicate ingestion loops
      const linkedArticle = mockImportedArticles.get("art-1");
      expect(linkedArticle?.syncStatus).toBe(ArticleSyncStatus.FILTERED);
      // Canonical URL and content hash are preserved
      expect(linkedArticle?.canonicalUrl).toBe("https://example.com/nasa-report");
      expect(linkedArticle?.contentHash).toBe("hash-12345");
    });

    it("forbids rejecting a story that is not in DRAFT status", async () => {
      const story = mockStories.get("story-1")!;
      story.status = ContentStatus.PUBLISHED;

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
      });

      const result = await rejectNewsDraftAction(fd);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Only draft stories can be rejected");
    });
  });

  describe("2. Authorization checks", () => {
    it("denies saveNewsDraftAction when user lacks write capability", async () => {
      mockRequireWriteCapability.mockRejectedValueOnce(new Error("Unauthorized: forbidden"));

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Attempted Unauthorized Save",
      });

      await expect(saveNewsDraftAction(fd)).rejects.toThrow("Unauthorized");
      expect(mockRequireWriteCapability).toHaveBeenCalledWith("stories.manage", "normal");
    });

    it("denies approveAndPublishNewsAction when user lacks write capability", async () => {
      mockRequireWriteCapability.mockRejectedValueOnce(new Error("Unauthorized: forbidden"));

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Attempted Unauthorized Publish",
        author: "Author",
        shortDescription: "Valid short description",
        description: "<p>Valid description</p>",
        categoryId: "cat-tech",
      });

      await expect(approveAndPublishNewsAction(fd)).rejects.toThrow("Unauthorized");
      expect(mockRequireWriteCapability).toHaveBeenCalledWith("stories.manage", "normal");
    });

    it("denies rejectNewsDraftAction when user lacks write capability", async () => {
      mockRequireWriteCapability.mockRejectedValueOnce(new Error("Unauthorized: forbidden"));

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
      });

      await expect(rejectNewsDraftAction(fd)).rejects.toThrow("Unauthorized");
      expect(mockRequireWriteCapability).toHaveBeenCalledWith("stories.manage", "sensitive");
    });
  });

  describe("3. Validation and rich-text sanitization", () => {
    it("requires a category before publishing", async () => {
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Valid Headline",
        author: "Author",
        shortDescription: "Valid description",
        description: "<p>Valid narrative</p>",
        categoryId: "", // missing category
      });

      const result = await approveAndPublishNewsAction(fd);
      expect(result.ok).toBe(false);
      expect(result.fieldErrors?.categoryId).toBeDefined();
    });

    it("rejects non-existent category on publish", async () => {
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Valid Headline",
        author: "Author",
        shortDescription: "Valid description",
        description: "<p>Valid narrative</p>",
        categoryId: "cat-non-existent",
      });

      const result = await approveAndPublishNewsAction(fd);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Assigned category does not exist");
    });

    it("sanitizes malicious markup in description on save and publish", async () => {
      const maliciousHtml = `
        <p>Legitimate news reporting</p>
        <script>alert("xss")</script>
        <img src="x" onerror="alert('hack')" />
        <a href="javascript:stealCookie()">Click me</a>
      `;

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Sanitized Headline",
        description: maliciousHtml,
        categoryId: "cat-tech",
      });

      const result = await saveNewsDraftAction(fd);
      expect(result.ok).toBe(true);

      const saved = mockStories.get("story-1");
      expect(saved?.description).not.toContain("<script>");
      expect(saved?.description).not.toContain("alert");
      expect(saved?.description).not.toContain("onerror");
      expect(saved?.description).not.toContain("javascript:");
      expect(saved?.description).toContain("Legitimate news reporting");
    });
  });

  describe("4. Optimistic concurrency control (stale edit detection)", () => {
    it("rejects draft save when expectedUpdatedAt does not match database updatedAt", async () => {
      const staleTimestamp = "2026-10-12T10:00:00.000Z";
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: staleTimestamp,
        title: "Stale Edit Attempt",
      });

      const result = await saveNewsDraftAction(fd);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("modified concurrently by another editor");
      // Verify story title was NOT modified
      expect(mockStories.get("story-1")?.title).not.toBe("Stale Edit Attempt");
    });

    it("rejects publish action when expectedUpdatedAt does not match database updatedAt", async () => {
      const staleTimestamp = "2026-10-12T10:00:00.000Z";
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: staleTimestamp,
        title: "Stale Publish Attempt",
        author: "Author",
        shortDescription: "Valid description",
        description: "<p>Valid narrative</p>",
        categoryId: "cat-tech",
      });

      const result = await approveAndPublishNewsAction(fd);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("modified concurrently by another editor");
      expect(mockStories.get("story-1")?.status).toBe(ContentStatus.DRAFT);
    });

    it("rejects reject action when expectedUpdatedAt does not match database updatedAt", async () => {
      const staleTimestamp = "2026-10-12T10:00:00.000Z";
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: staleTimestamp,
      });

      const result = await rejectNewsDraftAction(fd);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("modified concurrently by another editor");
      expect(mockStories.get("story-1")?.status).toBe(ContentStatus.DRAFT);
    });
  });

  describe("5. Cache invalidation behavior", () => {
    it("invalidates public story caches only on successful publish", async () => {
      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Publishing for Cache Test",
        author: "Author",
        shortDescription: "Valid description",
        description: "<p>Valid narrative body</p>",
        categoryId: "cat-tech",
      });

      const result = await approveAndPublishNewsAction(fd);
      expect(result.ok).toBe(true);

      expect(mockRevalidatePublicStoryCaches).toHaveBeenCalledTimes(1);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/stories/nasa-breakthrough-2026");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/news");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/news/story-1");
    });

    it("does not call public cache invalidation on save draft or reject", async () => {
      // Save draft
      const saveFd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Just a draft save",
      });
      await saveNewsDraftAction(saveFd);
      expect(mockRevalidatePublicStoryCaches).not.toHaveBeenCalled();

      // Reject draft
      const rejectFd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: mockStories.get("story-1")!.updatedAt.toISOString(),
      });
      await rejectNewsDraftAction(rejectFd);
      expect(mockRevalidatePublicStoryCaches).not.toHaveBeenCalled();
    });

    it("does not invalidate public cache if database transaction fails", async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(new Error("Database write failure"));

      const fd = makeFormData({
        storyId: "story-1",
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        title: "Will Fail in DB",
        author: "Author",
        shortDescription: "Valid description",
        description: "<p>Valid narrative</p>",
        categoryId: "cat-tech",
      });

      const result = await approveAndPublishNewsAction(fd);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("An unexpected error occurred during publication");
      expect(mockRevalidatePublicStoryCaches).not.toHaveBeenCalled();
    });
  });

  describe("6. Public exclusion of drafts and archived stories", () => {
    it("ensures public story query predicate is strictly PUBLISHED", () => {
      expect(PUBLIC_STORY_WHERE.status).toBe(ContentStatus.PUBLISHED);
      expect(PUBLIC_STORY_WHERE.status).not.toBe(ContentStatus.DRAFT);
      expect(PUBLIC_STORY_WHERE.status).not.toBe(ContentStatus.ARCHIVED);
    });

    it("ensures public story list filter always constrains to PUBLISHED", () => {
      const where = buildStoryListWhere({
        q: "NASA",
        category: "technology-science",
        tags: [],
      });

      expect(where.status).toBe(ContentStatus.PUBLISHED);
    });
  });
});
