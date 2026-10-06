"use client";

import { usePathname } from "next/navigation";
import {
  BookOpen,
  FolderTree,
  LayoutDashboard,
  Settings,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { AdminNavList } from "@/components/admin/AdminShell";

/**
 * Live admin navigation.
 *
 * Active state is derived from the pathname on the client so the server layout
 * does not need to thread the current route through. Section shape mirrors the
 * single-tier admin today; capability filtering can slot in here unchanged.
 */
interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match the path exactly. Used for the dashboard, which is a prefix of all. */
  exact?: boolean;
}

const SECTIONS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    heading: "Content",
    items: [
      { label: "Stories", href: "/admin/stories", icon: BookOpen },
      { label: "Categories", href: "/admin/categories", icon: FolderTree },
      { label: "Tags", href: "/admin/tags", icon: Tag },
    ],
  },
  {
    heading: "System",
    items: [{ label: "Settings", href: "/admin/settings", icon: Settings }],
  },
];

function isCurrent(pathname: string, item: NavItem): boolean {
  if (item.exact) {
    return pathname === item.href || pathname === `${item.href}/`;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  const sections = SECTIONS.map((section) => ({
    heading: section.heading,
    items: section.items.map((item) => ({
      label: item.label,
      href: item.href,
      icon: <item.icon className="size-4" />,
      current: isCurrent(pathname, item),
    })),
  }));

  return <AdminNavList sections={sections} />;
}
