"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableMeta,
  TableRow,
  SortButton,
} from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badge";
import type { ContentStatus } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";

/**
 * Interactive previews for the design-system page.
 *
 * The page itself stays a Server Component; only the controls that genuinely
 * need state live here. Each preview is the real primitive, not a mock, so the
 * documentation cannot drift from the implementation.
 */

export function DialogPreview() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Rename category"
        description="The slug is regenerated automatically. Existing links are not redirected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <p className="font-ui text-body-sm text-ink-muted">
          Focus moves into the panel on open, is trapped while it is open, returns
          to the trigger on close, and Escape closes it. On a phone the panel is
          a full-height sheet.
        </p>
      </Dialog>
    </>
  );
}

export function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete &ldquo;The Salt Road&rdquo;
      </Button>
      <ConfirmDialog
        open={open}
        loading={loading}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setLoading(true);
          window.setTimeout(() => {
            setLoading(false);
            setOpen(false);
          }, 900);
        }}
        title="Delete this story?"
        confirmLabel="Delete story"
        confirmationPhrase="The Salt Road"
        body={
          <>
            <p>
              This permanently removes the story, all{" "}
              <strong className="font-semibold text-ink">12 chapters</strong>, and
              its cover image. This cannot be undone.
            </p>
          </>
        }
      />
    </>
  );
}

const ROWS: Array<{
  title: string;
  status: ContentStatus;
  category: string;
  chapters: number;
}> = [
  { title: "The Salt Road", status: "PUBLISHED", category: "Travel", chapters: 12 },
  { title: "Nine Lives of a Borrowed Coat", status: "DRAFT", category: "Fiction", chapters: 3 },
  { title: "The Quiet Ledger", status: "ARCHIVED", category: "—", chapters: 7 },
];

export function SortableTableDemo() {
  const [direction, setDirection] = useState<"ascending" | "descending">(
    "ascending",
  );

  const sorted = [...ROWS].sort((a, b) =>
    direction === "ascending"
      ? a.title.localeCompare(b.title)
      : b.title.localeCompare(a.title),
  );

  return (
    <div className="flex flex-col gap-3">
      <Table caption="Stories, sortable by title">
        <TableHead>
          <TableHeaderCell sort={direction}>
            <SortButton
              label="Title"
              active
              direction={direction}
              onClick={() =>
                setDirection((current) =>
                  current === "ascending" ? "descending" : "ascending",
                )
              }
            />
          </TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Category</TableHeaderCell>
          <TableHeaderCell align="right">Chapters</TableHeaderCell>
        </TableHead>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.title}>
              <TableCell header>{row.title}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-ink-muted">{row.category}</TableCell>
              <TableCell align="right">{row.chapters}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TableMeta>Showing 1–3 of 3 stories</TableMeta>
    </div>
  );
}

export function DropdownSelectDemo() {
  const [last, setLast] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dropdown
        label="Publishing actions"
        variant="button"
        items={[
          { label: "Save draft", onSelect: () => setLast("Draft saved") },
          { label: "Publish now", onSelect: () => setLast("Story published") },
          {
            label: "Unpublish",
            onSelect: () => setLast("Moved back to draft"),
          },
        ]}
      />
      {last ? (
        <span role="status" className="font-ui text-body-xs text-ink-muted">
          {last}
        </span>
      ) : null}
    </div>
  );
}
