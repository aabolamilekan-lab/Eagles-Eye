"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { createCategoryAction, updateCategoryAction } from "@/actions/category";
import { INITIAL_TAXONOMY_FORM_STATE } from "@/lib/taxonomy/form";
import type { AdminCategoryDetail } from "@/lib/queries/admin-taxonomy";
import { TAXONOMY_DESCRIPTION_MAX } from "@/lib/validation/taxonomy";

/**
 * The category form.
 *
 * One form, one Server Action. The action re-checks the capability and the
 * duplicate-name and slug rules on the server; nothing here is a security
 * control (AGENTS.md section 9).
 */
export function CategoryForm({
  mode,
  category,
}: {
  mode: "create" | "edit";
  category?: AdminCategoryDetail;
}) {
  const action = mode === "create" ? createCategoryAction : updateCategoryAction;
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TAXONOMY_FORM_STATE,
  );

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <>
      <form action={formAction} className="flex flex-col">
        {mode === "edit" && category ? (
          <input type="hidden" name="id" value={category.id} />
        ) : null}

        {state.status === "error" && state.message ? (
          <div className="mb-6">
            <Alert tone="error" title="Could not save">
              {state.message}
            </Alert>
          </div>
        ) : null}

        <div className="flex max-w-2xl flex-col gap-6">
          <TextField
            label="Name"
            name="name"
            defaultValue={category?.name ?? ""}
            required
            hint="Shown to readers on the category page and cards."
            error={fieldError("name")}
          />
          <TextField
            label="Web address"
            name="slug"
            defaultValue={category?.slug ?? ""}
            hint="Lowercase words separated by hyphens. Left blank, it is generated from the name."
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            error={fieldError("slug")}
          />
          <TextAreaField
            label="Description"
            name="description"
            rows={3}
            defaultValue={category?.description ?? ""}
            maxLength={TAXONOMY_DESCRIPTION_MAX}
            hint="Plain text. A sentence introducing what belongs in this category."
            error={fieldError("description")}
          />
        </div>

        <div className="sticky bottom-0 z-10 mt-8 flex items-center gap-3 border-t border-border bg-paper py-4">
          <ButtonLink
            href="/admin/categories"
            variant="ghost"
            aria-disabled={pending || undefined}
          >
            Cancel
          </ButtonLink>
          <span className="flex-1" />
          <Button
            type="submit"
            variant="primary"
            loading={pending}
            loadingLabel="Saving, please wait"
            leadingIcon={<Save aria-hidden="true" className="size-4" />}
          >
            {mode === "create" ? "Create category" : "Save changes"}
          </Button>
        </div>
      </form>
    </>
  );
}
