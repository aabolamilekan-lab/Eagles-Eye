import type { Metadata } from "next";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import { queryAdminNewsSources } from "@/lib/queries/admin-news";
import { SourceManagementTable } from "@/components/admin/news/SourceManagementTable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News Sources | Admin",
  description: "Manage active news feeds, attribution policies, and source telemetry.",
};

export default async function AdminNewsSourcesPage() {
  // Enforce server-side authorization
  await requireCapability("settings.manage");

  const sources = await queryAdminNewsSources();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="News Sources"
        description="Configure active syndicated feeds, monitor ingestion telemetry, and activate or deactivate verified news sources."
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink
              href="/admin/news/sync"
              variant="secondary"
              size="sm"
              className="inline-flex items-center gap-1.5"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Sync Monitor
            </ButtonLink>
            <ButtonLink
              href="/admin/news"
              variant="secondary"
              size="sm"
              className="inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Review Queue
            </ButtonLink>
          </div>
        }
      />

      <SourceManagementTable sources={sources} />
    </div>
  );
}
