"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, EyeOff, Globe, Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CheckboxField, SelectField, TextField } from "@/components/ui/Field";
import { FormSection } from "@/components/admin/AdminForm";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { StatusBadge } from "@/components/ui/Badge";
import type { AdminChapterDetail } from "@/lib/queries/admin-chapters";
import { INITIAL_CHAPTER_FORM_STATE } from "@/lib/chapters/form";
import { createChapterAction, updateChapterAction } from "@/actions/chapter";

type ChapterStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface ChapterSubmitProps {
  type: "submit";
  name: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
}

interface ChapterEditorProps {
  mode: "create" | "edit";
  storyId: string;
  storyTitle: string;
  chapter?: AdminChapterDetail;
  /** Selectable 1-based positions, for the edit form's ordering control. */
  positions?: number[];
}

/**
 * The chapter editor.
 *
 * One form, one Server Action. In edit mode every workflow control is a submit
 * button distinguished only by its `intent` value, so publishing, unpublishing
 * or archiving also saves the content on screen first — a status change can
 * never silently discard what the operator typed. The action re-checks the
 * capability, the transition table and the sanitizer on the server; nothing
 * here is a security control.
 */
export function ChapterEditor({
  mode,
  storyId,
  storyTitle,
  chapter,
  positions,
}: ChapterEditorProps) {
  const action = mode === "create" ? createChapterAction : updateChapterAction;
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_CHAPTER_FORM_STATE,
  );

  const [content, setContent] = useState(chapter?.content ?? "");
  const [dirty, setDirty] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const router = useRouter();

  const status: ChapterStatus = chapter?.status ?? "DRAFT";
  const listHref = `/admin/stories/${storyId}/chapters`;

  // A successful save redirects and the page re-renders this editor with a
  // fresh `key` (see the edit page), so the component remounts with clean
  // state. That is why there is no "reset on save" effect here.

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  const leave = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    router.push(listHref);
  };

  const submitProps = (intent: string): ChapterSubmitProps => ({
    type: "submit",
    name: "intent",
    value: intent,
    disabled: pending,
    onClick: () => setPendingIntent(intent),
  });

  const busy = (intent: string) => pending && pendingIntent === intent;

  const positionOptions = (positions ?? []).map((value) => ({
    value: String(value),
    label: `Chapter ${value}`,
  }));

  return (
    <>
      <form action={formAction} onChange={markDirty} className="flex flex-col">
        <input type="hidden" name="storyId" value={storyId} />
        {mode === "edit" && chapter ? (
          <input type="hidden" name="id" value={chapter.id} />
        ) : null}

        {state.status === "error" && state.message ? (
          <div className="mb-6">
            <Alert tone="error" title="Could not save">
              {state.message}
            </Alert>
          </div>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex max-w-2xl flex-col gap-6">
            <FormSection
              title="Chapter"
              description={`Part of “${storyTitle}”. The title and web address are used in the reader's chapter list and links.`}
            >
              <TextField
                label="Title"
                name="title"
                defaultValue={chapter?.title ?? ""}
                required
                error={fieldError("title")}
              />
              <TextField
                label="Web address"
                name="slug"
                defaultValue={chapter?.slug ?? ""}
                hint="Lowercase words separated by hyphens. Unique within this story. Left blank, it is generated from the title."
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                error={fieldError("slug")}
              />
            </FormSection>

            <FormSection
              title="Content"
              description="Formatted with headings, lists and quotes. Sanitized on the server when saved."
            >
              <RichTextEditor
                name="content"
                label="Chapter content"
                value={content}
                onChange={(html) => {
                  setContent(html);
                  markDirty();
                }}
                error={fieldError("content")}
              />
            </FormSection>

            {mode === "edit" && chapter?.status === "PUBLISHED" ? (
              <FormSection
                title="Web address change"
                description="Changing a published chapter's web address breaks existing links. There is no automatic redirect."
              >
                <CheckboxField
                  name="confirmSlugChange"
                  label="Confirm changing this chapter's web address"
                />
                {fieldError("confirmSlugChange") ? (
                  <p
                    role="alert"
                    className="font-ui text-body-xs font-medium text-error"
                  >
                    {fieldError("confirmSlugChange")}
                  </p>
                ) : null}
              </FormSection>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-8">
            <PublishingPanel
              status={status}
              isNew={mode === "create"}
              submitProps={submitProps}
              busy={busy}
            />

            {mode === "edit" && chapter ? (
              <FormSection
                title="Ordering"
                description="Chapters are renumbered contiguously when the position changes."
              >
                <SelectField
                  label="Position"
                  name="chapterNumber"
                  defaultValue={String(chapter.chapterNumber)}
                  options={
                    positionOptions.length > 0
                      ? positionOptions
                      : [
                          {
                            value: String(chapter.chapterNumber),
                            label: `Chapter ${chapter.chapterNumber}`,
                          },
                        ]
                  }
                  error={fieldError("chapterNumber")}
                />
              </FormSection>
            ) : null}
          </aside>
        </div>

        <div className="sticky bottom-0 z-10 mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-paper py-4">
          <Button type="button" variant="ghost" disabled={pending} onClick={leave}>
            Cancel
          </Button>

          {dirty ? (
            <p
              role="status"
              className="font-ui text-body-xs font-medium text-warning"
            >
              Unsaved changes
            </p>
          ) : null}

          <span className="flex-1" />

          <Button
            {...submitProps("save")}
            variant="primary"
            loading={busy("save")}
            loadingLabel="Saving, please wait"
          >
            <Save aria-hidden="true" className="size-4" />
            {mode === "create" ? "Create draft" : "Save changes"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          router.push(listHref);
        }}
        title="Discard unsaved changes?"
        body={
          <p>
            This chapter has changes that have not been saved. Leaving now
            discards them.
          </p>
        }
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
      />
    </>
  );
}

function PublishingPanel({
  status,
  isNew,
  submitProps,
  busy,
}: {
  status: ChapterStatus;
  isNew: boolean;
  submitProps: (intent: string) => ChapterSubmitProps;
  busy: (intent: string) => boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-heading-sm text-ink">Publishing</h2>
        <StatusBadge status={status} />
      </div>

      <p className="font-ui text-body-xs text-ink-muted text-pretty">
        {isNew
          ? "New chapters are saved as a draft. Create it first, then publish when the text is ready. A story is only visible to readers once it has at least one published chapter."
          : status === "DRAFT"
            ? "Draft. Publish to add it to the reader's chapter list and navigation."
            : status === "PUBLISHED"
              ? "Live. Unpublishing returns it to a draft; archiving hides it while keeping it in admin."
              : "Archived. Publishing makes it visible to readers again."}
      </p>

      {!isNew ? (
        <div className="flex flex-col gap-2">
          {status === "DRAFT" ? (
            <Button
              {...submitProps("publish")}
              variant="primary"
              size="sm"
              loading={busy("publish")}
              loadingLabel="Publishing, please wait"
              leadingIcon={<Globe className="size-4" />}
            >
              Publish
            </Button>
          ) : null}

          {status === "PUBLISHED" ? (
            <>
              <Button
                {...submitProps("unpublish")}
                variant="secondary"
                size="sm"
                loading={busy("unpublish")}
                loadingLabel="Unpublishing, please wait"
                leadingIcon={<EyeOff className="size-4" />}
              >
                Unpublish
              </Button>
              <Button
                {...submitProps("archive")}
                variant="secondary"
                size="sm"
                loading={busy("archive")}
                loadingLabel="Archiving, please wait"
                leadingIcon={<Archive className="size-4" />}
              >
                Archive
              </Button>
            </>
          ) : null}

          {status === "ARCHIVED" ? (
            <Button
              {...submitProps("publish")}
              variant="primary"
              size="sm"
              loading={busy("publish")}
              loadingLabel="Publishing, please wait"
              leadingIcon={<Globe className="size-4" />}
            >
              Publish
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
