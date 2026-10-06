"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { loginAction } from "@/actions/auth/login";
import type { LoginActionState } from "@/lib/auth/login-messages";

const INITIAL_STATE: LoginActionState = {};

/**
 * The sign-in form.
 *
 * Client validation is a UX affordance only; the Server Action re-parses and is
 * the security boundary. The failure message is rendered once, never mapped to
 * a specific field, so it cannot distinguish an unknown account from a wrong
 * password.
 *
 * The visibility toggle changes only the input's `type`; the value is always
 * submitted as the password field, and the control carries `aria-pressed` so its
 * state is announced.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      {state.message ? (
        <Alert tone="error" title="Sign in failed">
          {state.message}
        </Alert>
      ) : null}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <TextField
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        required
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-pressed={showPassword}
            className="rounded-sm px-2 py-1 font-ui text-body-xs font-medium text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        }
      />

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={pending}
        loadingLabel="Signing in"
      >
        Sign in
      </Button>
    </form>
  );
}
