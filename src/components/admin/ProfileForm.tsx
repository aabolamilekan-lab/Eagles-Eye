"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { updateProfileAction } from "@/actions/account";
import { INITIAL_ACCOUNT_FORM_STATE } from "@/lib/account/form";
import { ACCOUNT_NAME_MAX } from "@/lib/validation/user";

/**
 * Display-name form.
 *
 * One form, one Server Action. The action re-checks the capability and parses
 * the input on the server; the `maxLength` here is a UX affordance only.
 */
export function ProfileForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    INITIAL_ACCOUNT_FORM_STATE,
  );

  const fieldError = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} className="flex flex-col">
      {state.status === "error" && state.message ? (
        <div className="mb-6">
          <Alert tone="error" title="Could not save">
            {state.message}
          </Alert>
        </div>
      ) : null}

      <div className="max-w-2xl">
        <TextField
          label="Display name"
          name="name"
          defaultValue={name}
          required
          maxLength={ACCOUNT_NAME_MAX}
          autoComplete="name"
          hint="Shown beside your work in the admin."
          error={fieldError("name")}
        />
      </div>

      <div className="mt-8 flex">
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel="Saving, please wait"
          leadingIcon={<Save aria-hidden="true" className="size-4" />}
        >
          Save changes
        </Button>
      </div>
    </form>
  );
}