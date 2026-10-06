import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/navigation/Wordmark";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div>
          <Wordmark />
        </div>

        <h1 className="mt-8 font-display text-display-sm text-ink">Sign in</h1>
        <p className="mt-2 font-ui text-body-sm text-ink-muted text-pretty">
          Administrators sign in here to manage stories, chapters, and
          categories.
        </p>

        <LoginForm />

        <p className="mt-6 font-ui text-body-xs text-ink-subtle">
          <Link href="/" className="underline underline-offset-4 hover:text-ink">
            Return to Eagles Eye
          </Link>
        </p>
      </div>
    </main>
  );
}
