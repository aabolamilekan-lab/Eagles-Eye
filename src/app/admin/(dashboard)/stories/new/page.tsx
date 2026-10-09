import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StoryEditor } from "@/components/admin/StoryEditor";
import { requireCapability } from "@/lib/auth/guards";
import { getStoryFormOptions } from "@/lib/queries/admin-stories";
import { getUploadSettings } from "@/lib/storage/settings";

export const dynamic = "force-dynamic";

/**
 * Create a story.
 *
 * Saving creates a DRAFT. Publishing from here is a deliberate choice: the story
 * becomes eligible for the public catalogue, but stays hidden until it has at
 * least one published chapter. Capability is re-checked in the Server Action.
 */
export default async function AdminNewStoryPage() {
  await requireCapability("stories.manage");

  const [options, upload] = await Promise.all([
    getStoryFormOptions(),
    getUploadSettings(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="New story"
        description="Start a draft. Nothing is visible to readers until you publish it. A published story appears in the catalogue; add a chapter so readers can start reading."
      />
      <StoryEditor
        mode="create"
        categories={options.categories}
        tags={options.tags}
        upload={upload}
      />
    </>
  );
}
