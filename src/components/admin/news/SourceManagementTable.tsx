"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Power,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { toggleNewsSourceAction } from "@/actions/news-sources";
import type { AdminNewsSourceRow } from "@/lib/queries/admin-news";
import { formatPublishedDate } from "@/lib/format";

interface SourceManagementTableProps {
  sources: AdminNewsSourceRow[];
}

export function SourceManagementTable({ sources }: SourceManagementTableProps) {
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleToggle = (sourceId: string, currentActive: boolean) => {
    setFeedback(null);
    setTogglingId(sourceId);

    const formData = new FormData();
    formData.set("sourceId", sourceId);
    formData.set("active", currentActive ? "false" : "true");

    startTransition(async () => {
      try {
        const result = await toggleNewsSourceAction(formData);
        if (result.ok) {
          setFeedback({
            type: "success",
            text: result.message || "Source status updated successfully.",
          });
        } else {
          setFeedback({
            type: "error",
            text: result.error || "Failed to update source status.",
          });
        }
      } catch (_err) {
        setFeedback({
          type: "error",
          text: "An unexpected error occurred while toggling source status.",
        });
      } finally {
        setTogglingId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-ui text-body-sm">
            <thead className="border-b border-border bg-surface-sunken/50 text-caption font-semibold uppercase tracking-wider text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-3 sm:px-6">Source</th>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3 hidden md:table-cell">Health & Telemetry</th>
                <th scope="col" className="px-4 py-3 hidden lg:table-cell">Attribution</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-ink-muted">
                    No news sources configured. Run bootstrap script to initialize verified sources.
                  </td>
                </tr>
              ) : (
                sources.map((source) => {
                  const isUpdating = isPending && togglingId === source.id;
                  const isFailing = source.consecutiveFailures > 0;
                  const lastSuccessStr = source.lastSuccessAt
                    ? formatPublishedDate(source.lastSuccessAt.toISOString())
                    : "Never";

                  return (
                    <tr
                      key={source.id}
                      className="transition-colors hover:bg-surface-sunken/30"
                    >
                      <td className="px-4 py-4 sm:px-6">
                        <div className="flex flex-col gap-1 max-w-sm">
                          <span className="font-medium text-ink">
                            {source.name}
                          </span>
                          <div className="flex items-center gap-2 text-caption text-ink-muted">
                            <span className="font-mono text-ink-subtle">{source.feedType}</span>
                            <span>•</span>
                            <a
                              href={source.feedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 truncate hover:text-primary transition-colors max-w-[200px]"
                              title={source.feedUrl}
                            >
                              <span>Feed URL</span>
                              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {source.defaultCategory ? (
                          <Badge tone="neutral">{source.defaultCategory.name}</Badge>
                        ) : (
                          <span className="text-caption text-warning">Unassigned</span>
                        )}
                      </td>

                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="flex flex-col gap-1 text-caption">
                          <div className="flex items-center gap-2">
                            <span className="text-ink-muted">Last Success:</span>
                            <span className="text-ink">{lastSuccessStr}</span>
                          </div>
                          {isFailing ? (
                            <div className="flex items-center gap-1.5 text-error">
                              <AlertCircle className="size-3.5 shrink-0" />
                              <span>{source.consecutiveFailures} consecutive failure{source.consecutiveFailures === 1 ? "" : "s"}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="size-3.5 shrink-0" />
                              <span>Healthy</span>
                            </div>
                          )}
                          {source.lastErrorMessage ? (
                            <p
                              className="line-clamp-1 max-w-xs text-caption text-ink-subtle font-mono"
                              title={source.lastErrorMessage}
                            >
                              {source.lastErrorMessage}
                            </p>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 py-4 hidden lg:table-cell">
                        {source.attributionPolicy ? (
                          <div className="flex items-center gap-1.5 text-caption text-ink-muted">
                            <ShieldCheck className="size-4 text-ink-subtle" />
                            <span className="truncate max-w-[140px]">{source.attributionPolicy}</span>
                          </div>
                        ) : (
                          <span className="text-caption text-ink-subtle">Unset</span>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {source.isActive ? (
                          <Badge tone="success" dot>Active</Badge>
                        ) : (
                          <Badge tone="neutral">Inactive</Badge>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <Button
                          type="button"
                          variant={source.isActive ? "subtle" : "primary"}
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleToggle(source.id, source.isActive)}
                          className="inline-flex items-center gap-1.5"
                        >
                          {isUpdating ? (
                            <RefreshCw className="size-3.5 animate-spin" />
                          ) : (
                            <Power className="size-3.5" />
                          )}
                          <span>{source.isActive ? "Deactivate" : "Activate"}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
