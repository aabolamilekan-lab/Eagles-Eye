import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { DashboardPanel } from "@/components/admin/DashboardPanel";
import { PasswordForm } from "@/components/admin/PasswordForm";
import { ProfileForm } from "@/components/admin/ProfileForm";
import { Alert } from "@/components/ui/Alert";
import { requireCapability } from "@/lib/auth/guards";
import { resolveAccountNotice } from "@/lib/account/form";
import { getAdminAccount } from "@/lib/queries/admin-account";
import { formatPublishedDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

interface AdminSettingsPageProps {
  searchParams: Promise<{ notice?: string | string[] }>;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
};

/**
 * Account settings.
 *
 * The capability is re-checked here, not only in the layout (AGENTS.md section
 * 15). The account is loaded from the session's own user id, so the screen can
 * only ever show and edit the signed-in administrator; email, role and status
 * are read-only and are never accepted as input.
 */
export default async function AdminSettingsPage({
  searchParams,
}: AdminSettingsPageProps) {
  const session = await requireCapability("settings.manage");
  const account = await getAdminAccount(session.userId);
  if (!account) {
    notFound();
  }

  const query = await searchParams;
  const notice = resolveAccountNotice(query.notice);

  const details: Array<{ label: string; value: string }> = [
    { label: "Email", value: account.email },
    { label: "Role", value: ROLE_LABEL[account.role] ?? account.role },
    { label: "Status", value: account.isActive ? "Active" : "Inactive" },
    {
      label: "Member since",
      value: formatPublishedDate(account.createdAt) ?? "—",
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Your administrator account."
      />

      {notice ? (
        <div className="mb-6">
          <Alert tone={notice.tone} title={notice.title}>
            {notice.message}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DashboardPanel
            title="Profile"
            description="The name shown beside your work in the admin."
          >
            <div className="p-5">
              <ProfileForm name={account.name} />
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Password"
            description="Changing your password signs out your other devices."
          >
            <div className="p-5">
              <PasswordForm />
            </div>
          </DashboardPanel>
        </div>

        <DashboardPanel
          title="Account"
          description="Read-only details for this account."
          className="h-fit"
        >
          <dl className="flex flex-col divide-y divide-(--color-border)">
            {details.map((entry) => (
              <div
                key={entry.label}
                className="flex flex-col gap-1 px-5 py-3.5"
              >
                <dt className="label-micro text-ink-subtle">{entry.label}</dt>
                <dd className="font-ui text-body-sm text-ink break-words">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </DashboardPanel>
      </div>
    </>
  );
}