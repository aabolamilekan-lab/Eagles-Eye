"use client";

import { useActionState } from "react";
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
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);

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
        type="password"
        autoComplete="current-password"
        required
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
