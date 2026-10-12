"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ShareActionsProps {
  title: string;
  url: string;
}

const emptySubscribe = () => () => {};

function getCanShareSnapshot(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function getCanShareServerSnapshot(): boolean {
  return false;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.69 1.69 0 0 0 1.7-1.68 1.7 1.7 0 0 0-1.7-1.69 1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.97v-8.37H5.07v8.37h2.78z" />
    </svg>
  );
}

/**
 * Social Sharing and URL copy controls for public story & article pages.
 * Fully accessible with keyboard navigation, screen reader feedback, and native share integration.
 */
export function ShareActions({ title, url }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const hasNativeShare = useSyncExternalStore(
    emptySubscribe,
    getCanShareSnapshot,
    getCanShareServerSnapshot,
  );

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_err) {
      // Fallback
      setCopied(false);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          url,
        });
      } catch (_err) {
        // User cancelled or share failed silently
      }
    }
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    title,
  )}&url=${encodeURIComponent(url)}`;

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    url,
  )}`;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      <span className="font-ui text-body-xs font-semibold uppercase tracking-wider text-ink-subtle mr-1">
        Share
      </span>

      {hasNativeShare ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleNativeShare}
          className="rounded-full inline-flex items-center gap-1.5"
          aria-label="Share via device options"
        >
          <Share2 className="size-3.5" aria-hidden="true" />
          <span>Share</span>
        </Button>
      ) : null}

      <Button
        type="button"
        variant={copied ? "subtle" : "secondary"}
        size="sm"
        onClick={handleCopyLink}
        className="rounded-full inline-flex items-center gap-1.5 transition-all"
        aria-label={copied ? "Link copied to clipboard" : "Copy article link to clipboard"}
      >
        {copied ? (
          <>
            <Check className="size-3.5 text-success" aria-hidden="true" />
            <span className="text-success-ink font-semibold">Copied!</span>
          </>
        ) : (
          <>
            <Copy className="size-3.5" aria-hidden="true" />
            <span>Copy Link</span>
          </>
        )}
      </Button>

      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share story on X (opens in new tab)"
        className="inline-flex h-8 items-center justify-center rounded-full border border-border-strong bg-surface px-3 font-ui text-body-xs text-ink hover:bg-surface-sunken transition-colors gap-1.5 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <XIcon className="size-3.5 text-ink-muted" />
        <span>Post</span>
      </a>

      <a
        href={linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share story on LinkedIn (opens in new tab)"
        className="inline-flex h-8 items-center justify-center rounded-full border border-border-strong bg-surface px-3 font-ui text-body-xs text-ink hover:bg-surface-sunken transition-colors gap-1.5 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <LinkedInIcon className="size-3.5 text-ink-muted" />
        <span>Share</span>
      </a>

      {/* Screen reader announcement for clipboard action */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Story link copied to clipboard." : ""}
      </span>
    </div>
  );
}
