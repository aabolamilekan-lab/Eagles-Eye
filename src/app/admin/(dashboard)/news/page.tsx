import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Newspaper, ArrowRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { requireCapability } from "@/lib/auth/guards";
import { formatPublishedDate } from "@/lib/format";
import { queryAdminNewsList } from "@/lib/queries/admin-news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News Review Queue – Administration",
};

interface NewsQueuePageProps {
  searchParams: Promise<{
    status?: string;
    category?: string;
    page?: string;
  }>;
}

export default async function NewsQueuePage({ searchParams }: NewsQueuePageProps) {
  // Authorization check (layout guard is not a substitute)
  await requireCapability("stories.manage");

  const rawParams = await searchParams;
  const rawStatus = (rawParams.status || "DRAFT").toUpperCase();
  const validStatus =
    rawStatus === "ALL" ||
    rawStatus === "DRAFT" ||
    rawStatus === "PUBLISHED" ||
    rawStatus === "ARCHIVED"
      ? (rawStatus as "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED")
      : "DRAFT";

  const page = Math.max(1, Number.parseInt(rawParams.page || "1", 10) || 1);

  const result = await queryAdminNewsList({
    status: validStatus,
    category: rawParams.category || null,
    page,
    pageSize: 20,
  });

  const currentStatus = validStatus;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="News Review Queue"
        description="Review, edit, publish, or reject incoming automated news drafts."
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4 font-ui text-body-sm">
        <Link
          href="/admin/news?status=DRAFT"
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            currentStatus === "DRAFT"
              ? "bg-surface-sunken text-ink font-semibold"
              : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
          }`}
        >
          Pending Review
        </Link>
        <Link
          href="/admin/news?status=PUBLISHED"
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            currentStatus === "PUBLISHED"
              ? "bg-surface-sunken text-ink font-semibold"
              : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
          }`}
        >
          Published
        </Link>
        <Link
          href="/admin/news?status=ARCHIVED"
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            currentStatus === "ARCHIVED"
              ? "bg-surface-sunken text-ink font-semibold"
              : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
          }`}
        >
          Rejected / Archived
        </Link>
        <Link
          href="/admin/news?status=ALL"
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            currentStatus === "ALL"
              ? "bg-surface-sunken text-ink font-semibold"
              : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
          }`}
        >
          All News
        </Link>
      </div>

      {/* Table / List */}
      {result.items.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="size-8" />}
          title="No articles in this queue"
          description={
            currentStatus === "DRAFT"
              ? "There are currently no imported news drafts waiting for review."
              : "No news articles match the selected filter."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-ui text-body-sm">
              <thead className="border-b border-border bg-surface-sunken/50 text-caption font-semibold uppercase tracking-wider text-ink-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 sm:px-6">Article / Headline</th>
                  <th scope="col" className="px-4 py-3 hidden md:table-cell">Source & Category</th>
                  <th scope="col" className="px-4 py-3 hidden sm:table-cell">Date</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {result.items.map((item) => {
                  const dateStr = item.rawPublishedAt
                    ? formatPublishedDate(item.rawPublishedAt.toISOString())
                    : formatPublishedDate(item.createdAt.toISOString());

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-surface-sunken/30"
                    >
                      <td className="px-4 py-4 sm:px-6">
                        <div className="flex flex-col gap-1 max-w-lg">
                          <Link
                            href={`/admin/news/${item.story.id}`}
                            className="font-medium text-ink hover:text-primary transition-colors line-clamp-2"
                          >
                            {item.story.title || item.title}
                          </Link>
                          <div className="flex items-center gap-2 text-caption text-ink-muted">
                            <span className="truncate">{item.source.name}</span>
                            <span>•</span>
                            <a
                              href={item.canonicalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 hover:text-primary transition-colors"
                              title="Original article link"
                            >
                              <span>Original</span>
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="flex flex-col gap-1.5 items-start">
                          <Badge tone="neutral">{item.source.name}</Badge>
                          {item.story.category ? (
                            <span className="text-caption text-ink-muted">
                              {item.story.category.name}
                            </span>
                          ) : (
                            <span className="text-caption text-warning">Uncategorized</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 hidden sm:table-cell whitespace-nowrap text-caption text-ink-muted">
                        {dateStr}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {item.story.status === "DRAFT" ? (
                          <Badge tone="warning" dot>Pending Review</Badge>
                        ) : item.story.status === "PUBLISHED" ? (
                          <Badge tone="success" dot>Published</Badge>
                        ) : (
                          <Badge tone="neutral" dot>Archived</Badge>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <ButtonLink
                          href={`/admin/news/${item.story.id}`}
                          variant="ghost"
                          size="sm"
                          trailingIcon={<ArrowRight className="size-3.5" />}
                        >
                          Review
                        </ButtonLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.pageCount > 1 ? (
            <div className="border-t border-border p-4">
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                totalItems={result.total}
                pageSize={result.pageSize}
                buildHref={(targetPage: number) =>
                  `/admin/news?status=${currentStatus}&page=${targetPage}`
                }
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
