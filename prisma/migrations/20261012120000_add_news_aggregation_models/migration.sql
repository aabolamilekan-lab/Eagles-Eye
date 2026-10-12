-- CreateEnum
CREATE TYPE "NewsFeedType" AS ENUM ('RSS', 'ATOM', 'JSON_API');

-- CreateEnum
CREATE TYPE "ArticleSyncStatus" AS ENUM ('DISCOVERED', 'IMPORTED', 'DUPLICATE', 'FILTERED', 'FAILED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('ACTIVE', 'SUSPECTED_REMOVED', 'CONFIRMED_WITHDRAWN');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "feedType" "NewsFeedType" NOT NULL DEFAULT 'RSS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultCategoryId" TEXT,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "etag" TEXT,
    "lastModified" TEXT,
    "attributionPolicy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedArticle" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "rawPublishedAt" TIMESTAMP(3),
    "summary" TEXT,
    "contentHash" TEXT NOT NULL,
    "syncStatus" "ArticleSyncStatus" NOT NULL DEFAULT 'DISCOVERED',
    "withdrawalStatus" "WithdrawalStatus" NOT NULL DEFAULT 'ACTIVE',
    "withdrawalEvidence" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "storyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSyncLog" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "jobId" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL,
    "articlesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "articlesImported" INTEGER NOT NULL DEFAULT 0,
    "articlesSkipped" INTEGER NOT NULL DEFAULT 0,
    "articlesUpdated" INTEGER NOT NULL DEFAULT 0,
    "articlesWithdrawn" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "NewsSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSyncLock" (
    "id" TEXT NOT NULL DEFAULT 'global_news_sync',
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSyncLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_slug_key" ON "NewsSource"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_feedUrl_key" ON "NewsSource"("feedUrl");

-- CreateIndex
CREATE INDEX "NewsSource_isActive_lastFetchedAt_idx" ON "NewsSource"("isActive", "lastFetchedAt");

-- CreateIndex
CREATE INDEX "NewsSource_defaultCategoryId_idx" ON "NewsSource"("defaultCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedArticle_canonicalUrl_key" ON "ImportedArticle"("canonicalUrl");

-- CreateIndex
CREATE INDEX "ImportedArticle_sourceId_syncStatus_idx" ON "ImportedArticle"("sourceId", "syncStatus");

-- CreateIndex
CREATE INDEX "ImportedArticle_withdrawalStatus_idx" ON "ImportedArticle"("withdrawalStatus");

-- CreateIndex
CREATE INDEX "ImportedArticle_storyId_idx" ON "ImportedArticle"("storyId");

-- CreateIndex
CREATE INDEX "ImportedArticle_rawPublishedAt_idx" ON "ImportedArticle"("rawPublishedAt" DESC);

-- CreateIndex
CREATE INDEX "ImportedArticle_sourceId_externalId_idx" ON "ImportedArticle"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "NewsSyncLog_startedAt_idx" ON "NewsSyncLog"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsSyncLog_sourceId_startedAt_idx" ON "NewsSyncLog"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "NewsSyncLog_jobId_idx" ON "NewsSyncLog"("jobId");

-- AddForeignKey
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedArticle" ADD CONSTRAINT "ImportedArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedArticle" ADD CONSTRAINT "ImportedArticle_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsSyncLog" ADD CONSTRAINT "NewsSyncLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
