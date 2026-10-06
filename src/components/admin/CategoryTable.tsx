import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { formatPublishedDate } from "@/lib/format";
import type { AdminCategoryRow } from "@/lib/queries/admin-taxonomy";

/**
 * Admin category list.
 *
 * A real table with a per-row link to the editor. The public link appears only
 * when the category has at least one publicly visible story, so it never opens
 * an empty catalogue (AGENTS.md section 6).
 */
export function CategoryTable({ categories }: { categories: AdminCategoryRow[] }) {
  return (
    <Table caption="Categories">
      <TableHead>
        <TableHeaderCell>Category</TableHeaderCell>
        <TableHeaderCell align="right">Stories</TableHeaderCell>
        <TableHeaderCell align="right">Published</TableHeaderCell>
        <TableHeaderCell>Updated</TableHeaderCell>
        <TableHeaderCell align="right">Actions</TableHeaderCell>
      </TableHead>

      <TableBody>
        {categories.map((category) => (
          <TableRow key={category.id}>
            <TableCell header>
              <Link
                href={`/admin/categories/${category.id}/edit`}
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                {category.name}
              </Link>
              <span className="mt-0.5 block font-mono text-body-xs text-ink-subtle">
                /{category.slug}
              </span>
            </TableCell>

            <TableCell align="right">{category.storyCount}</TableCell>

            <TableCell align="right">{category.publishedStoryCount}</TableCell>

            <TableCell>{formatPublishedDate(category.updatedAt) ?? "—"}</TableCell>

            <TableCell align="right">
              <div className="flex justify-end gap-2">
                {category.publishedStoryCount > 0 ? (
                  <ButtonLink
                    href={`/categories/${category.slug}`}
                    size="sm"
                    variant="ghost"
                  >
                    View
                  </ButtonLink>
                ) : null}
                <ButtonLink
                  href={`/admin/categories/${category.id}/edit`}
                  size="sm"
                  variant="secondary"
                >
                  Edit
                </ButtonLink>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
