import { AdminUnavailable } from "@/components/admin/AdminUnavailable";

export default function AdminSettingsPage() {
  return (
    <AdminUnavailable
      title="Settings"
      description="Manage account and site configuration."
      detail="Settings become available once accounts and the data layer are implemented."
    />
  );
}
