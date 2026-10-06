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
import type { AdminTagRow } from "@/lib/queries/admin-taxonomy";

/**
 * Admin tag list.
 *
 * Tags have no public page of their own — readers reach them through search and
 * the catalogue filter — so the only action is Edit.
 */
export function TagTable({ tags }: { tags: AdminTagRow[] }) {
  return (
    <Table caption="Tags">
      <TableHead>
        <TableHeaderCell>Tag</TableHeaderCell>
        <TableHeaderCell align="right">Stories</TableHeaderCell>
        <TableHeaderCell align="right">Published</TableHeaderCell>
        <TableHeaderCell align="right">Actions</TableHeaderCell>
      </TableHead>

      <TableBody>
        {tags.map((tag) => (
          <TableRow key={tag.id}>
            <TableCell header>
              <Link
                href={`/admin/tags/${tag.id}/edit`}
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                {tag.name}
              </Link>
              <span className="mt-0.5 block font-mono text-body-xs text-ink-subtle">
                /{tag.slug}
              </span>
            </TableCell>

            <TableCell align="right">{tag.storyCount}</TableCell>

            <TableCell align="right">{tag.publishedStoryCount}</TableCell>

            <TableCell align="right">
              <ButtonLink
                href={`/admin/tags/${tag.id}/edit`}
                size="sm"
                variant="secondary"
              >
                Edit
              </ButtonLink>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
