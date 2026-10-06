/**
 * Server-startup validation.
 *
 * Next.js calls `register` once when a server instance boots. Environment
 * validation runs here so a misconfigured deployment fails immediately with a
 * named error instead of failing at an unclear call site later. The
 * production-build phase is skipped so `next build` does not need production
 * secrets that are only present at runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { getEnv } = await import("./lib/env");
  getEnv();
}
