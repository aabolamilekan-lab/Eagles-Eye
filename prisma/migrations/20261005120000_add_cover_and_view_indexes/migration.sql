-- Cover delivery and recent-view reads.
--
-- `Story.coverImage` backs the only lookup the image route performs: it
-- resolves a private storage key to the story that references it on every cover
-- request. Without an index that is a sequential scan of Story per image.
--
-- `StoryView.viewedAt` backs the admin dashboard's most-recent-views rail. The
-- existing `(storyId, viewedAt)` index cannot serve `ORDER BY viewedAt DESC`
-- because its leading column is unconstrained, so the ordering also needed a
-- full sort.

-- CreateIndex
CREATE INDEX "Story_coverImage_idx" ON "Story"("coverImage");

-- CreateIndex
CREATE INDEX "StoryView_viewedAt_idx" ON "StoryView"("viewedAt");