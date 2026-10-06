import type { ReactNode } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminShell, AdminSidebar } from "@/components/admin/AdminShell";
import { Wordmark } from "@/components/navigation/Wordmark";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/guards";
import { logoutAction } from "@/actions/auth/logout";

/**
 * Guarded admin layout.
 *
 * `requireAdmin` runs on the server before anything renders and redirects to
 * sign-in when there is no session. The sign-in route lives outside this group
 * so it is not itself guarded (AGENTS.md section 15).
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <AdminShell
      sidebar={<AdminSidebar brand={<Wordmark href="/admin" />} nav={<AdminNav />} />}
      header={
        <header className="flex h-16 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
          <p className="font-ui text-body-sm font-medium text-ink">
            Administration
          </p>
          <span className="ml-auto hidden max-w-48 truncate font-ui text-body-sm text-ink-muted sm:inline">
            {session.email}
          </span>
          <Link
            href="/"
            className="font-ui text-body-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            View public site
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>
      }
    >
      {children}
    </AdminShell>
  );
}
