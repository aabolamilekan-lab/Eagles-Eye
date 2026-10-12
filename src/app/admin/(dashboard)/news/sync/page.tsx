import type { Metadata } from "next";
import { ArrowLeft, Rss } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";
import {
  queryAdminNewsSyncLockStatus,
  queryAdminNewsSyncLogs,
} from "@/lib/queries/admin-news";
import { SyncMonitorView } from "@/components/admin/news/SyncMonitorView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sync Monitor | Admin",
  description: "Monitor news feed synchronization runs, lock contention, and manual synchronization.",
};

interface AdminNewsSyncPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AdminNewsSyncPage({
  searchParams,
}: AdminNewsSyncPageProps) {
  // Enforce server-side authorization
  await requireCapability("settings.manage");

  const query = await searchParams;
  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);

  const [logsResult, lockStatus] = await Promise.all([
    queryAdminNewsSyncLogs(page, 20),
    queryAdminNewsSyncLockStatus(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sync Monitor"
        description="Inspect background and manual feed synchronization runs, monitor lock status, and trigger authorized synchronization jobs."
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink
              href="/admin/news/sources"
              variant="secondary"
              size="sm"
              className="inline-flex items-center gap-1.5"
            >
              <Rss className="size-4" aria-hidden="true" />
              News Sources
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

      <SyncMonitorView logsResult={logsResult} lockStatus={lockStatus} />
    </div>
  );
}
