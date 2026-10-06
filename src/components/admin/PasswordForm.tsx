"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { changePasswordAction } from "@/actions/account";
import { INITIAL_ACCOUNT_FORM_STATE } from "@/lib/account/form";
import { PASSWORD_MIN } from "@/lib/validation/user";

/**
 * Password change form.
 *
 * Changing the password revokes every other session and re-mints the current
 * one, so this device stays signed in. The visibility toggle changes only the
 * input `type`; the value is always submitted as its own field.
 */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    INITIAL_ACCOUNT_FORM_STATE,
  );

  const fieldError = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} className="flex flex-col">
      {state.status === "error" && state.message ? (
        <div className="mb-6">
          <Alert tone="error" title="Could not change password">
            {state.message}
          </Alert>
        </div>
      ) : null}

      <div className="flex max-w-2xl flex-col gap-6">
        <PasswordField
          label="Current password"
          name="currentPassword"
          autoComplete="current-password"
          error={fieldError("currentPassword")}
        />
        <PasswordField
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={fieldError("newPassword")}
        />
        <PasswordField
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          error={fieldError("confirmPassword")}
        />
      </div>

      <div className="mt-8 flex">
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel="Changing password, please wait"
          leadingIcon={<KeyRound aria-hidden="true" className="size-4" />}
        >
          Change password
        </Button>
      </div>
    </form>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  hint,
  error,
}: {
  label: string;
  name: string;
  autoComplete: string;
  hint?: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      label={label}
      name={name}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      required
      hint={hint}
      error={error}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((showing) => !showing)}
          aria-pressed={visible}
          className="rounded-sm px-2 py-1 font-ui text-body-xs font-medium text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
}