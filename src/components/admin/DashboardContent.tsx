import { BookOpen, Eye, FileText, Layers } from "lucide-react";
import { StatCard, StatGrid } from "@/components/admin/AdminShell";
import { DashboardActivity } from "@/components/admin/DashboardActivity";
import { PublicationStats } from "@/components/admin/PublicationStats";
import { QuickActions } from "@/components/admin/QuickActions";
import { RecentChaptersSection } from "@/components/admin/RecentChaptersSection";
import { RecentStoriesSection } from "@/components/admin/RecentStoriesSection";
import { getAdminDashboard } from "@/lib/queries/admin/stats";

/**
 * Dashboard body.
 *
 * A separate async component so it can stream behind a Suspense boundary in the
 * page while the counts load. Every value comes from `getAdminDashboard`; the
 * page has already checked the `stats.view` capability.
 */
export async function DashboardContent() {
  const now = new Date();
  const data = await getAdminDashboard(now);

  return (
    <div className="flex flex-col gap-10">
      <StatGrid>
        <StatCard
          label="Published stories"
          value={data.stories.published}
          hint="Live in the public catalogue"
          href="/admin/stories"
          icon={<BookOpen className="size-4" />}
        />
        <StatCard
          label="Draft stories"
          value={data.stories.draft}
          hint="Not visible to readers"
          href="/admin/stories"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Chapters"
          value={data.chapters.total}
          hint={`${data.chapters.published} published`}
          href="/admin/stories"
          icon={<Layers className="size-4" />}
        />
        <StatCard
          label="Story views"
          value={data.totalStoryViews}
          hint="Recorded on stories"
          icon={<Eye className="size-4" />}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentStoriesSection stories={data.recentStories} />
        </div>
        <PublicationStats
          stories={data.stories}
          chapters={data.chapters}
          categories={data.categories}
          tags={data.tags}
          storiesPublishedThisYear={data.storiesPublishedThisYear}
          chaptersPublishedThisYear={data.chaptersPublishedThisYear}
          year={now.getUTCFullYear()}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentChaptersSection chapters={data.recentChapters} />
        </div>
        <div className="flex flex-col gap-6">
          <QuickActions />
          <DashboardActivity
            views={data.recentViews}
            recordedViews={data.recordedViews}
          />
        </div>
      </div>
    </div>
  );
}
