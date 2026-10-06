import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  FolderTree,
  Plus,
  Settings,
  Tags,
} from "lucide-react";
import { DashboardPanel } from "@/components/admin/DashboardPanel";

const ACTIONS = [
  { label: "Create a story", href: "/admin/stories/new", icon: Plus },
  { label: "Browse stories", href: "/admin/stories", icon: BookOpen },
  { label: "Manage categories", href: "/admin/categories", icon: FolderTree },
  { label: "Manage tags", href: "/admin/tags", icon: Tags },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

/** The operations an administrator reaches for most often. */
export function QuickActions() {
  return (
    <DashboardPanel title="Quick actions" description="Common tasks.">
      <ul className="flex flex-col p-2">
        {ACTIONS.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="flex h-10 items-center gap-3 rounded-md px-3 font-ui text-body-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              <span aria-hidden="true" className="shrink-0 text-ink-subtle">
                <action.icon className="size-4" />
              </span>
              <span className="flex-1">{action.label}</span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-ink-subtle"
              />
            </Link>
          </li>
        ))}
      </ul>
    </DashboardPanel>
  );
}
