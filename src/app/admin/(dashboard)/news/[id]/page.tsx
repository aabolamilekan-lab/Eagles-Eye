import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { NewsEditorialForm } from "@/components/admin/news/NewsEditorialForm";
import { StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import {
  queryAdminNewsItem,
  queryNewsCategoryOptions,
} from "@/lib/queries/admin-news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review News Article | Admin",
  description: "Editorial review and publishing workflow for imported news articles.",
};

interface AdminNewsItemPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminNewsItemPage({
  params,
}: AdminNewsItemPageProps) {
  // Enforce server-side authorization
  await requireCapability("stories.manage");

  const { id } = await params;
  const [item, categories] = await Promise.all([
    queryAdminNewsItem(id),
    queryNewsCategoryOptions(),
  ]);

  if (!item) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={item.story.title || item.importedArticle.title}
        description={`Imported from ${item.importedArticle.source.name}. Review original coverage, edit headline and narrative summary, assign category, and publish or archive.`}
        meta={<StatusBadge status={item.story.status} />}
        actions={
          <ButtonLink
            href="/admin/news"
            variant="secondary"
            size="sm"
            className="inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Queue
          </ButtonLink>
        }
      />

      <NewsEditorialForm item={item} categories={categories} />
    </div>
  );
}
