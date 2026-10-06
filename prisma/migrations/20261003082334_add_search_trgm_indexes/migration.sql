-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Category_name_idx" ON "Category" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Story_title_idx" ON "Story" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Story_author_idx" ON "Story" USING GIN ("author" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Story_shortDescription_idx" ON "Story" USING GIN ("shortDescription" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Story_description_idx" ON "Story" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag" USING GIN ("name" gin_trgm_ops);
