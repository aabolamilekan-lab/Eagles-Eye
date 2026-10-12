"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  Play,
  Unlock,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { triggerManualSyncAction } from "@/actions/news-sync";
import type {
  AdminNewsSyncLockStatus,
  AdminNewsSyncLogsResult,
} from "@/lib/queries/admin-news";
import { formatPublishedDate } from "@/lib/format";

interface SyncMonitorViewProps {
  logsResult: AdminNewsSyncLogsResult;
  lockStatus: AdminNewsSyncLockStatus;
}

export function SyncMonitorView({ logsResult, lockStatus }: SyncMonitorViewProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleTriggerSync = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await triggerManualSyncAction();
        if (result.ok) {
          setFeedback({
            type: "success",
            text: result.message || "Synchronization completed successfully.",
          });
        } else {
          setFeedback({
            type: "error",
            text: result.error || "Synchronization could not be started.",
          });
        }
      } catch (_err) {
        setFeedback({
          type: "error",
          text: "An unexpected error occurred while triggering synchronization.",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Status & Controls Strip */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex items-center gap-3">
          {lockStatus.isLocked ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <Lock className="size-5" />
            </div>
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
              <Unlock className="size-5" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-ui text-body-sm font-semibold text-ink">
              {lockStatus.isLocked ? "Synchronization Active" : "Lock Ready & Idle"}
            </span>
            <span className="text-caption text-ink-muted">
              {lockStatus.isLocked
                ? `Held by ${lockStatus.lockedBy || "worker"} until ${
                    lockStatus.lockedUntil ? lockStatus.lockedUntil.toLocaleTimeString() : "expiry"
                  }`
                : "No active cron or manual sync worker holding the distributed lock."}
            </span>
          </div>
        </div>

        <div>
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={isPending}
            loadingLabel="Synchronizing..."
            disabled={isPending || lockStatus.isLocked}
            onClick={handleTriggerSync}
            leadingIcon={!isPending ? <Play className="size-4" /> : undefined}
          >
            Trigger Sync Now
          </Button>
        </div>
      </div>

      {feedback ? (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-lg border p-4 text-body-sm animate-fade-in ${
            feedback.type === "success"
              ? "border-success/30 bg-success/10 text-success-ink"
              : "border-error/30 bg-error/10 text-error-ink"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          ) : (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-error" />
          )}
          <div className="flex-1 font-medium">{feedback.text}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-caption text-ink-muted hover:text-ink transition-colors"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Sync Run Logs Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="border-b border-border bg-surface-sunken/40 px-4 py-3 sm:px-6">
          <h2 className="font-ui text-body-sm font-semibold text-ink">
            Recent Synchronization Runs
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-ui text-body-sm">
            <thead className="border-b border-border bg-surface-sunken/20 text-caption font-semibold uppercase tracking-wider text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-3 sm:px-6">Timestamp / Job</th>
                <th scope="col" className="px-4 py-3">Source</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-center">Discovered</th>
                <th scope="col" className="px-4 py-3 text-center">Imported</th>
                <th scope="col" className="px-4 py-3 text-center">Skipped</th>
                <th scope="col" className="px-4 py-3">Duration</th>
                <th scope="col" className="px-4 py-3">Details / Sanitized Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {logsResult.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-ink-muted">
                    No synchronization logs recorded yet. Run a manual or automated sync to generate records.
                  </td>
                </tr>
              ) : (
                logsResult.items.map((log) => {
                  const dateStr = formatPublishedDate(log.startedAt.toISOString());
                  const statusTone =
                    log.status === "SUCCESS"
                      ? "success"
                      : log.status === "PARTIAL_SUCCESS"
                        ? "warning"
                        : "error";

                  return (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-surface-sunken/30"
                    >
                      <td className="px-4 py-4 sm:px-6 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-ink">{dateStr}</span>
                          <span className="font-mono text-caption text-ink-subtle truncate max-w-[140px]" title={log.jobId}>
                            {log.jobId}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {log.source ? (
                          <span className="font-medium text-ink">{log.source.name}</span>
                        ) : (
                          <span className="text-ink-muted">All Sources</span>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <Badge tone={statusTone} dot>
                          {log.status}
                        </Badge>
                      </td>

                      <td className="px-4 py-4 text-center tabular-nums text-ink-muted">
                        {log.articlesDiscovered}
                      </td>

                      <td className="px-4 py-4 text-center tabular-nums font-medium text-ink">
                        {log.articlesImported}
                      </td>

                      <td className="px-4 py-4 text-center tabular-nums text-ink-muted">
                        {log.articlesSkipped}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap tabular-nums text-caption text-ink-muted">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3 text-ink-subtle" />
                          <span>{log.durationMs}ms</span>
                        </div>
                      </td>

                      <td className="px-4 py-4 max-w-xs">
                        {log.errorMessage ? (
                          <span
                            className="line-clamp-2 font-mono text-caption text-error"
                            title={log.errorMessage}
                          >
                            {log.errorMessage}
                          </span>
                        ) : (
                          <span className="text-caption text-ink-subtle">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {logsResult.pageCount > 1 ? (
          <div className="border-t border-border p-4">
            <Pagination
              page={logsResult.page}
              pageCount={logsResult.pageCount}
              totalItems={logsResult.total}
              pageSize={logsResult.pageSize}
              buildHref={(targetPage: number) => `/admin/news/sync?page=${targetPage}`}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
