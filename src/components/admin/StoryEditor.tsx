"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  EyeOff,
  Globe,
  RotateCcw,
  Save,
  Star,
  StarOff,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/Field";
import { FormSection } from "@/components/admin/AdminForm";
import { CoverUploader } from "@/components/admin/CoverUploader";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { StatusBadge } from "@/components/ui/Badge";
import type { AdminStoryDetail } from "@/lib/queries/admin-stories";
import type { UploadSettings } from "@/lib/storage/settings";
import { INITIAL_STORY_FORM_STATE } from "@/lib/stories/form";
import { createStoryAction, updateStoryAction } from "@/actions/story";

type StoryStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface StorySubmitProps {
  type: "submit";
  name: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
}

interface StoryEditorProps {
  mode: "create" | "edit";
  story?: AdminStoryDetail;
  categories: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string }>;
  upload: UploadSettings;
}

/**
 * The story editor.
 *
 * One form, one Server Action. Every workflow control is a submit button that
 * differs only by its `intent` value, so publishing, unpublishing, archiving or
 * featuring always saves the content visible on screen first — a status change
 * can never silently discard what the operator has typed. The action re-checks
 * the capability and the transition table on the server; nothing here is a
 * security control.
 */
export function StoryEditor({
  mode,
  story,
  categories,
  tags,
  upload,
}: StoryEditorProps) {
  const action = mode === "create" ? createStoryAction : updateStoryAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STORY_FORM_STATE);

  const [description, setDescription] = useState(story?.description ?? "");
  const [coverImage, setCoverImage] = useState(story?.coverImage ?? "");
  const [dirty, setDirty] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const router = useRouter();

  const status: StoryStatus = story?.status ?? "DRAFT";

  // A successful save redirects and the page re-renders the editor with a fresh
  // `key` (see the edit page), so the component remounts with clean state. That
  // is why there is no "reset on save" effect here: remounting is the reset.

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
  const selectedTags = new Set(story?.tagIds ?? []);

  const leave = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    router.push("/admin/stories");
  };

  const submitProps = (intent: string): StorySubmitProps => ({
    type: "submit",
    name: "intent",
    value: intent,
    disabled: pending,
    onClick: () => setPendingIntent(intent),
  });

  const busy = (intent: string) => pending && pendingIntent === intent;

  return (
    <>
      <form action={formAction} onChange={markDirty} className="flex flex-col">
        {mode === "edit" && story ? (
          <input type="hidden" name="id" value={story.id} />
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
              title="Details"
              description="The title and short description appear on cards, in search and in page metadata."
            >
              <TextField
                label="Title"
                name="title"
                defaultValue={story?.title ?? ""}
                required
                error={fieldError("title")}
              />
              <TextField
                label="Web address"
                name="slug"
                defaultValue={story?.slug ?? ""}
                hint="Lowercase words separated by hyphens. Left blank, it is generated from the title."
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                error={fieldError("slug")}
              />
              <TextField
                label="Author"
                name="author"
                defaultValue={story?.author ?? ""}
                error={fieldError("author")}
              />
              <TextAreaField
                label="Short description"
                name="shortDescription"
                rows={3}
                defaultValue={story?.shortDescription ?? ""}
                hint="Plain text. A sentence or two for cards and search results."
                error={fieldError("shortDescription")}
              />
            </FormSection>

            <FormSection
              title="Description"
              description="Formatted with headings, lists and quotes. Sanitized on the server when saved."
            >
              <RichTextEditor
                name="description"
                value={description}
                onChange={(html) => {
                  setDescription(html);
                  markDirty();
                }}
                error={fieldError("description")}
              />
            </FormSection>

            <FormSection
              title="Cover image"
              description="Upload a JPEG, PNG or WebP image. The cover is stored privately and served through this application; remote image URLs are not accepted."
            >
              <CoverUploader
                value={coverImage}
                onChange={(next) => {
                  setCoverImage(next);
                  markDirty();
                }}
                error={fieldError("coverImage")}
                uploadEnabled={upload.enabled}
                maxBytes={upload.maxBytes}
                maxMegabytes={upload.maxMegabytes}
                accept={upload.accept}
              />
            </FormSection>

            {mode === "edit" && story?.status === "PUBLISHED" ? (
              <FormSection
                title="Web address change"
                description="Changing a published story's web address breaks existing links. There is no automatic redirect."
              >
                <CheckboxField
                  name="confirmSlugChange"
                  label="Confirm changing this story's web address"
                />
                {fieldError("confirmSlugChange") ? (
                  <p role="alert" className="font-ui text-body-xs font-medium text-error">
                    {fieldError("confirmSlugChange")}
                  </p>
                ) : null}
              </FormSection>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-8">
            <PublishingPanel
              status={status}
              featured={story?.featured ?? false}
              isNew={mode === "create"}
              pending={pending}
              submitProps={submitProps}
              busy={busy}
            />

            <FormSection
              title="Organisation"
              description="A category groups the story; tags widen discovery. Both are optional."
            >
              <SelectField
                label="Category"
                name="categoryId"
                defaultValue={story?.categoryId ?? ""}
                options={[
                  { value: "", label: "Uncategorised" },
                  ...categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
                error={fieldError("categoryId")}
              />

              <fieldset className="flex flex-col gap-3">
                <legend className="font-ui text-body-sm font-medium text-ink">
                  Tags
                </legend>
                {tags.length === 0 ? (
                  <p className="font-ui text-body-xs text-ink-muted">
                    No tags exist yet. Tags appear here once they are created.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {tags.map((tag) => (
                      <CheckboxField
                        key={tag.id}
                        name="tagIds"
                        value={tag.id}
                        label={tag.name}
                        defaultChecked={selectedTags.has(tag.id)}
                      />
                    ))}
                  </div>
                )}
                {fieldError("tagIds") ? (
                  <p role="alert" className="font-ui text-body-xs font-medium text-error">
                    {fieldError("tagIds")}
                  </p>
                ) : null}
              </fieldset>
            </FormSection>
          </aside>
        </div>

        <div className="sticky bottom-0 z-10 mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-paper py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={leave}
          >
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
            {mode === "create" ? "Save draft" : "Save changes"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          router.push("/admin/stories");
        }}
        title="Discard unsaved changes?"
        body={
          <p>
            This story has changes that have not been saved. Leaving now discards
            them.
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
  featured,
  isNew,
  pending,
  submitProps,
  busy,
}: {
  status: StoryStatus;
  featured: boolean;
  isNew: boolean;
  pending: boolean;
  submitProps: (intent: string) => StorySubmitProps;
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
          ? "Saved as a draft first. Publishing adds the story to the public catalogue; add a published chapter so readers can start reading."
          : status === "DRAFT"
            ? "Draft. Publish when the story is ready; it becomes visible as soon as it is published."
            : status === "PUBLISHED"
              ? "Live. Unpublishing hides it from readers; archiving also archives its published chapters."
              : "Archived. It is hidden from readers until you restore it."}
      </p>

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
            <Button
              {...submitProps(featured ? "unfeature" : "feature")}
              variant="ghost"
              size="sm"
              aria-pressed={featured}
              loading={busy(featured ? "unfeature" : "feature")}
              loadingLabel="Updating, please wait"
              leadingIcon={
                featured ? <StarOff className="size-4" /> : <Star className="size-4" />
              }
            >
              {featured ? "Remove from featured" : "Feature on the home page"}
            </Button>
          </>
        ) : null}

        {status === "ARCHIVED" ? (
          <Button
            {...submitProps("restore")}
            variant="secondary"
            size="sm"
            loading={busy("restore")}
            loadingLabel="Restoring, please wait"
            leadingIcon={<RotateCcw className="size-4" />}
          >
            Restore to draft
          </Button>
        ) : null}

        {pending ? (
          <p className="sr-only" role="status">
            Working
          </p>
        ) : null}
      </div>
    </section>
  );
}
