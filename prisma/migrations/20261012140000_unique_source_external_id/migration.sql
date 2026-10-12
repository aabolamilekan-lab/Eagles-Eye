-- DropIndex
DROP INDEX "ImportedArticle_sourceId_externalId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ImportedArticle_sourceId_externalId_key" ON "ImportedArticle"("sourceId", "externalId");
