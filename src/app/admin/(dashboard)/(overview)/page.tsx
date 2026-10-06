import { Suspense } from "react";
import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { DashboardContent } from "@/components/admin/DashboardContent";
import { DashboardSkeleton } from "@/components/admin/DashboardSkeleton";
import { ButtonLink } from "@/components/ui/Button";
import { requireCapability } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard.
 *
 * The capability is re-checked here, not only in the layout: a layout guard is
 * a UX convenience, not access control (AGENTS.md section 15). Counts stream in
 * behind Suspense so the header paints immediately.
 */
export default async function AdminDashboardPage() {
  await requireCapability("stats.view");

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="A summary of the catalogue: stories, chapters, categories, and reader activity."
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
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}
