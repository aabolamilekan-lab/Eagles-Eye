"use client";

import { useActionState, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, GripVertical, Pencil } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { INITIAL_CHAPTER_FORM_STATE } from "@/lib/chapters/form";
import { reorderChaptersAction } from "@/actions/chapter";
import type { AdminChapterListRow } from "@/lib/queries/admin-chapters";

/**
 * Reorderable admin chapter list.
 *
 * The stored `chapterNumber` is the real sequence, so a save writes the whole
 * order in one mutation. Reordering is destructive in effect, so the action
 * validates the payload against the stored id set inside a serializable
 * transaction. Drag-and-drop is a mouse affordance; the arrow buttons are the
 * keyboard-operable equivalent and neither is a security control.
 *
 * The page remounts this component (see its `key`) after a redirect, so the
 * local order cannot drift from what the database actually holds.
 */
export function ChapterOrderList({
  storyId,
  chapters,
}: {
  storyId: string;
  chapters: AdminChapterListRow[];
}) {
  const [state, formAction, pending] = useActionState(
    reorderChaptersAction,
    INITIAL_CHAPTER_FORM_STATE,
  );

  const [items, setItems] = useState(chapters);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [initialOrder] = useState(() =>
    chapters.map((chapter) => chapter.id).join(","),
  );

  const dirty = items.map((chapter) => chapter.id).join(",") !== initialOrder;

  const move = (index: number, direction: -1 | 1) => {
    setItems((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const a = next[index];
      const b = next[target];
      if (!a || !b) {
        return previous;
      }
      next[index] = b;
      next[target] = a;
      return next;
    });
  };

  const onDragStart = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    dragIndex.current = index;
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    const from = dragIndex.current;
    dragIndex.current = null;
    setDragOver(null);
    if (from === null || from === index) {
      return;
    }
    setItems((previous) => {
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      if (!moved) {
        return previous;
      }
      next.splice(index, 0, moved);
      return next;
    });
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="storyId" value={storyId} />
      {/* The DOM order of these inputs is the submitted order. */}
      {items.map((chapter) => (
        <input key={chapter.id} type="hidden" name="order" value={chapter.id} />
      ))}

      {state.status === "error" && state.message ? (
        <Alert tone="error" title="Could not save the order">
          {state.message}
        </Alert>
      ) : null}

      <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {items.map((chapter, index) => (
          <li
            key={chapter.id}
            draggable
            onDragStart={onDragStart(index)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(index);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={onDrop(index)}
            className={cn(
              "flex items-center gap-3 px-3 py-2",
              dragOver === index && "bg-surface-sunken",
            )}
          >
            <span
              aria-hidden="true"
              className="cursor-grab text-ink-subtle/70"
            >
              <GripVertical className="size-4" />
            </span>

            <span className="w-7 shrink-0 font-ui text-body-sm font-medium tabular-nums text-ink-muted">
              {index + 1}
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-ui text-body-sm font-medium text-ink">
                {chapter.title}
              </span>
              <span className="truncate font-ui text-body-xs text-ink-subtle">
                {chapter.slug}
              </span>
            </div>

            <StatusBadge status={chapter.status} />

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${chapter.title} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${chapter.title} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Link
                href={`/admin/stories/${storyId}/chapters/${chapter.id}/edit`}
                aria-label={`Edit ${chapter.title}`}
                className={buttonClasses({ variant: "ghost", size: "icon" })}
              >
                <Pencil className="size-4" />
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          loadingLabel="Saving order, please wait"
          disabled={!dirty}
        >
          Save order
        </Button>

        {dirty ? (
          <p
            role="status"
            className="font-ui text-body-xs font-medium text-warning"
          >
            Order not saved
          </p>
        ) : (
          <p className="font-ui text-body-xs text-ink-subtle">
            Drag a row, or use the arrows, then save.
          </p>
        )}
      </div>
    </form>
  );
}
