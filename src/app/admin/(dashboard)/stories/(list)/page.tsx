import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StoryFilters } from "@/components/admin/StoryFilters";
import { StoryTable } from "@/components/admin/StoryTable";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { requireCapability } from "@/lib/auth/guards";
import {
  getStoryFormOptions,
  queryAdminStoryList,
} from "@/lib/queries/admin-stories";
import { resolveStoryNotice } from "@/lib/stories/notices";
import {
  adminStoryListHref,
  parseAdminStoryListSearch,
  type StoryListSearchInput,
} from "@/lib/validation/story";

export const dynamic = "force-dynamic";

interface AdminStoriesPageProps {
  searchParams: Promise<StoryListSearchInput>;
}

/**
 * Admin story list.
 *
 * State lives in the URL (`q`, `status`, `category`, `sort`, `page`), validated
 * and normalized before any query runs. The capability is re-checked here, not
 * only in the layout. `.agent/skills/story-management/SKILL.md`.
 */
export default async function AdminStoriesPage({
  searchParams,
}: AdminStoriesPageProps) {
  await requireCapability("stories.manage");

  const raw = await searchParams;
  const search = parseAdminStoryListSearch(raw);
  const notice = resolveStoryNotice(raw.notice);
  const hasFilters =
    search.q !== "" || search.status !== "ALL" || search.category !== null;

  const [result, options] = await Promise.all([
    queryAdminStoryList({
      q: search.q,
      status: search.status,
      category: search.category,
      sort: search.sort,
      page: search.page,
    }),
    getStoryFormOptions(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Stories"
        description="Create, edit, publish, and archive stories."
        actions={
          <ButtonLink
            href="/admin/stories/new"
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="size-4" />}
          >
            New story
          </ButtonLink>
        }
      />

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      <StoryFilters
        search={search}
        categories={options.categories}
        hasFilters={hasFilters}
      />

      <div className="mt-8">
        {result.total === 0 ? (
          hasFilters ? (
            <EmptyState
              title="No stories match these filters"
              description="Try a different search term, or clear the filters to see every story."
              action={
                <ButtonLink href="/admin/stories" variant="secondary">
                  Clear filters
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              tone="admin"
              title="No stories yet"
              description="Create the first story as a draft, add its chapters, then publish when it is ready."
              action={
                <ButtonLink href="/admin/stories/new" variant="primary">
                  New story
                </ButtonLink>
              }
            />
          )
        ) : (
          <>
            <p className="mb-4 font-ui text-body-sm text-ink-muted">
              <span className="tabular-nums">{result.total}</span>{" "}
              {result.total === 1 ? "story" : "stories"}
            </p>

            <StoryTable stories={result.stories} />

            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              totalItems={result.total}
              pageSize={result.pageSize}
              itemNoun="story"
              itemNounPlural="stories"
              buildHref={(target) => adminStoryListHref(search, { page: target })}
              className="mt-8"
            />
          </>
        )}
      </div>
    </>
  );
}
