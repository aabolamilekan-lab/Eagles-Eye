"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SourceAttributionCard } from "@/components/stories/SourceAttributionCard";
import {
  approveAndPublishNewsAction,
  rejectNewsDraftAction,
  saveNewsDraftAction,
} from "@/actions/news-editorial";
import type { AdminNewsItemDetail } from "@/lib/queries/admin-news";

interface NewsEditorialFormProps {
  item: AdminNewsItemDetail;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export function NewsEditorialForm({ item, categories }: NewsEditorialFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { story, importedArticle } = item;

  // Local form state
  const [title, setTitle] = useState(story.title);
  const [author, setAuthor] = useState(story.author || "");
  const [categoryId, setCategoryId] = useState(story.categoryId || "");
  const [shortDescription, setShortDescription] = useState(story.shortDescription || "");
  const [description, setDescription] = useState(story.description || "");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(story.updatedAt.toISOString());

  // Feedback state
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isRejecting, setIsRejecting] = useState(false);

  // Live attribution data for preview
  const previewAttribution = {
    publisher: importedArticle.source.name,
    originalTitle: importedArticle.title,
    canonicalUrl: importedArticle.canonicalUrl,
    originalAuthor: author || importedArticle.author,
    attributionPolicy: importedArticle.source.attributionPolicy,
  };

  const handleSaveDraft = () => {
    setStatusMessage(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.set("storyId", story.id);
    formData.set("expectedUpdatedAt", expectedUpdatedAt);
    formData.set("title", title);
    formData.set("author", author);
    formData.set("categoryId", categoryId);
    formData.set("shortDescription", shortDescription);
    formData.set("description", description);

    startTransition(async () => {
      const res = await saveNewsDraftAction(formData);
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: res.message || "Draft saved successfully.",
        });
        if (res.updatedAt) {
          setExpectedUpdatedAt(res.updatedAt);
        }
        router.refresh();
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Failed to save draft.",
        });
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      }
    });
  };

  const handlePublish = () => {
    if (
      !window.confirm(
        "Are you sure you want to approve and publish this story? It will become publicly visible immediately.",
      )
    ) {
      return;
    }

    setStatusMessage(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.set("storyId", story.id);
    formData.set("expectedUpdatedAt", expectedUpdatedAt);
    formData.set("title", title);
    formData.set("author", author);
    formData.set("categoryId", categoryId);
    formData.set("shortDescription", shortDescription);
    formData.set("description", description);

    startTransition(async () => {
      const res = await approveAndPublishNewsAction(formData);
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: res.message || "Story published successfully!",
        });
        router.push("/admin/news?status=PUBLISHED");
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Failed to publish story.",
        });
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      }
    });
  };

  const handleReject = () => {
    if (
      !window.confirm(
        "Are you sure you want to reject and archive this draft? The article will be marked as filtered and will not be re-imported.",
      )
    ) {
      return;
    }

    setStatusMessage(null);
    setIsRejecting(true);

    const formData = new FormData();
    formData.set("storyId", story.id);
    formData.set("expectedUpdatedAt", expectedUpdatedAt);

    startTransition(async () => {
      const res = await rejectNewsDraftAction(formData);
      setIsRejecting(false);
      if (res.ok) {
        router.push("/admin/news?status=ARCHIVED");
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Failed to reject draft.",
        });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column (8 cols): Editorial Edit Workspace */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
        {/* Status Alerts */}
        {statusMessage ? (
          <div
            className={`flex items-start gap-3 rounded-xl p-4 text-body-sm font-ui ${
              statusMessage.type === "success"
                ? "bg-success-surface text-success border border-success/30"
                : "bg-error-surface text-error border border-error/30"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
            )}
            <p>{statusMessage.text}</p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 flex flex-col gap-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 className="font-display text-heading-md font-semibold text-ink">
                Editorial Workspace
              </h2>
              <p className="text-body-xs text-ink-muted mt-0.5">
                Edit the AI-generated brief for reader discovery before publishing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-ink-subtle">Status:</span>
              {story.status === "DRAFT" ? (
                <Badge tone="warning" dot>Draft</Badge>
              ) : story.status === "PUBLISHED" ? (
                <Badge tone="success" dot>Published</Badge>
              ) : (
                <Badge tone="neutral" dot>Archived</Badge>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="flex flex-col gap-5">
            {/* Title Input */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="news-title"
                className="font-ui text-label-sm font-medium text-ink"
              >
                Headline / Title <span className="text-error">*</span>
              </label>
              <input
                id="news-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={story.status !== "DRAFT" || isPending}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-ui text-body text-ink transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                maxLength={200}
              />
              {fieldErrors.title ? (
                <span className="text-caption text-error font-ui">
                  {fieldErrors.title[0]}
                </span>
              ) : null}
            </div>

            {/* Author & Category in Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="news-author"
                  className="font-ui text-label-sm font-medium text-ink"
                >
                  Original Author / Reporter
                </label>
                <input
                  id="news-author"
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  disabled={story.status !== "DRAFT" || isPending}
                  placeholder="e.g. Amina Yusuf"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-ui text-body text-ink transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  maxLength={200}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="news-category"
                  className="font-ui text-label-sm font-medium text-ink"
                >
                  Assigned Category <span className="text-error">*</span>
                </label>
                <select
                  id="news-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={story.status !== "DRAFT" || isPending}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-ui text-body text-ink transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">Select a category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.categoryId ? (
                  <span className="text-caption text-error font-ui">
                    {fieldErrors.categoryId[0]}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Short Description */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="news-short-desc"
                  className="font-ui text-label-sm font-medium text-ink"
                >
                  Short Lead Description <span className="text-error">*</span>
                </label>
                <span className="text-caption text-ink-subtle">
                  {shortDescription.length}/300
                </span>
              </div>
              <textarea
                id="news-short-desc"
                rows={3}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                disabled={story.status !== "DRAFT" || isPending}
                maxLength={300}
                placeholder="Concise 1-2 sentence lead for search results and social cards..."
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-ui text-body text-ink transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
              {fieldErrors.shortDescription ? (
                <span className="text-caption text-error font-ui">
                  {fieldErrors.shortDescription[0]}
                </span>
              ) : null}
            </div>

            {/* Full AI Summary Description */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="news-content"
                className="font-ui text-label-sm font-medium text-ink"
              >
                Article Content (Sanitized HTML) <span className="text-error">*</span>
              </label>
              <textarea
                id="news-content"
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={story.status !== "DRAFT" || isPending}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-body-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
              {fieldErrors.description ? (
                <span className="text-caption text-error font-ui">
                  {fieldErrors.description[0]}
                </span>
              ) : null}
            </div>
          </div>

          {/* Action Bar */}
          {story.status === "DRAFT" ? (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={handleReject}
                disabled={isPending || isRejecting}
                leadingIcon={<XCircle className="size-4" />}
              >
                {isRejecting ? "Rejecting..." : "Reject & Archive"}
              </Button>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleSaveDraft}
                  disabled={isPending}
                  leadingIcon={<Save className="size-4" />}
                >
                  Save Draft
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handlePublish}
                  disabled={isPending}
                  leadingIcon={<Send className="size-4" />}
                >
                  Approve & Publish
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-border pt-4 text-caption text-ink-muted">
              This story is {story.status.toLowerCase()} and cannot be edited from the draft queue.
            </div>
          )}
        </div>
      </div>

      {/* Right Column (5 cols): Source Truth & Live Attribution Preview */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
        {/* Source Evidence Card */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs flex flex-col gap-4">
          <h3 className="font-ui text-label-sm font-semibold uppercase tracking-wider text-ink-subtle">
            Original Source Reference
          </h3>

          <div className="flex flex-col gap-2 font-ui text-body-sm">
            <div>
              <span className="text-caption text-ink-subtle">Publisher:</span>
              <p className="font-medium text-ink">{importedArticle.source.name}</p>
            </div>

            <div>
              <span className="text-caption text-ink-subtle">Original Headline:</span>
              <p className="font-medium text-ink">{importedArticle.title}</p>
            </div>

            <div>
              <span className="text-caption text-ink-subtle">Canonical Article Link:</span>
              <a
                href={importedArticle.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline font-medium break-all mt-0.5"
              >
                <span>{importedArticle.canonicalUrl}</span>
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              </a>
            </div>

            {importedArticle.rawPublishedAt ? (
              <div>
                <span className="text-caption text-ink-subtle">Published Date:</span>
                <p className="text-ink-muted">
                  {new Date(importedArticle.rawPublishedAt).toUTCString()}
                </p>
              </div>
            ) : null}

            {importedArticle.summary ? (
              <div className="mt-2 rounded-xl bg-surface-sunken p-3 border border-border/60">
                <span className="text-caption font-semibold text-ink-subtle block mb-1">
                  Raw Feed Snippet:
                </span>
                <p className="text-caption text-ink-muted line-clamp-6 leading-relaxed">
                  {importedArticle.summary}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Live Reader Attribution Preview */}
        <div className="flex flex-col gap-2">
          <h3 className="font-ui text-label-sm font-semibold uppercase tracking-wider text-ink-subtle px-1">
            Live Reader Attribution Preview
          </h3>
          <SourceAttributionCard attribution={previewAttribution} />
        </div>
      </div>
    </div>
  );
}
