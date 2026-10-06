import { AdminPageHeader } from "@/components/admin/AdminShell";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The honest state for an admin screen whose backing capability does not exist
 * yet.
 *
 * This is scaffolding, not a working feature. It states plainly that the screen
 * is not available rather than rendering a form that submits nowhere or a table
 * of invented rows. Replace each usage with the real screen as its data layer
 * lands.
 */
export function AdminUnavailable({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <>
      <AdminPageHeader title={title} description={description} />
      <EmptyState tone="admin" title="Not available in this build" description={detail} />
    </>
  );
}
