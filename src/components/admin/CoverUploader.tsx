"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { isCoverKey } from "@/lib/storage/cover-key";

/**
 * Cover image control.
 *
 * A cover is always an object this application stores: the direct upload route
 * returns a server-generated key, which is the only value the hidden
 * `coverImage` field ever carries. There is deliberately no field for pasting a
 * remote URL — an admin-typed URL would have to be allowlisted in `next/image`
 * to render at all, and that allowlist turns the image optimizer into an open
 * proxy for any hostname the admin names.
 *
 * The upload itself is unprivileged here — this component is a UX affordance;
 * the route enforces origin, session, capability, rate limit, signature and
 * re-encode. Progress and typed errors are shown without discarding the
 * current value.
 *
 * A preview is rendered through a plain `<img>` on purpose: it points at the
 * authenticated image route for a draft, which `next/image`'s server-side
 * optimizer cannot fetch with the admin's cookie.
 */
const CLIENT_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);


type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface CoverUploaderProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** False when storage or the image pipeline is unavailable on the server. */
  uploadEnabled: boolean;
  maxBytes: number;
  maxMegabytes: number;
  accept: string;
}

function previewSource(
  value: string,
  objectUrl: string | null,
): string | null {
  if (objectUrl) {
    return objectUrl;
  }
  const trimmed = value.trim();
  if (!trimmed || !isCoverKey(trimmed)) {
    return null;
  }
  return `/api/images/${encodeURIComponent(trimmed)}`;
}

function readUploadedKey(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { ok?: unknown }).ok === true
  ) {
    const key = (payload as { key?: unknown }).key;
    if (typeof key === "string" && key.length > 0) {
      return key;
    }
  }
  return null;
}

function readErrorMessage(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return null;
}

function fallbackMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "You do not have permission to upload images.";
  }
  if (status === 413) {
    return "That image is larger than the allowed size.";
  }
  if (status === 415) {
    return "Only JPEG, PNG and WebP images are accepted.";
  }
  if (status === 429) {
    return "Too many uploads. Wait a moment and try again.";
  }
  return "The upload failed. Please try again.";
}

export function CoverUploader({
  value,
  onChange,
  error,
  uploadEnabled,
  maxBytes,
  maxMegabytes,
  accept,
}: CoverUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const groupId = useId();

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  const source = previewSource(value, objectUrl);

  function upload(file: File) {
    setStatus("uploading");
    setProgress(0);
    setMessage(null);

    const request = new XMLHttpRequest();
    requestRef.current = request;
    request.open("POST", "/api/admin/uploads");
    request.responseType = "text";

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      const key = readUploadedKey(payload);
      if (request.status === 200 && key) {
        setProgress(100);
        setPreviewFailed(false);
        setObjectUrl(URL.createObjectURL(file));
        onChange(key);
        setStatus("success");
        return;
      }

      setStatus("error");
      setMessage(readErrorMessage(payload) ?? fallbackMessage(request.status));
    };

    request.onerror = () => {
      setStatus("error");
      setMessage("The upload failed. Check your connection and try again.");
    };

    request.onabort = () => {
      setStatus("idle");
      setProgress(0);
      setMessage(null);
    };

    const body = new FormData();
    body.append("file", file);
    request.send(body);
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setPreviewFailed(false);

    if (!CLIENT_ALLOWED_TYPES.has(file.type)) {
      setStatus("error");
      setMessage("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > maxBytes) {
      setStatus("error");
      setMessage(`That image is larger than ${maxMegabytes} MB.`);
      return;
    }

    upload(file);
  }

  function handleText(next: string) {
    setPreviewFailed(false);
    if (status === "success") {
      setStatus("idle");
    }
    onChange(next);
  }

  function handleRemove() {
    setPreviewFailed(false);
    setStatus("idle");
    setMessage(null);
    setObjectUrl(null);
    onChange("");
  }

  const busy = status === "uploading";

  return (
    <div className="flex flex-col gap-3">
      {source && !previewFailed ? (
        <div className="relative aspect-3/2 w-full max-w-xs overflow-hidden rounded-md border border-border bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source}
            alt="Cover preview"
            className="size-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        </div>
      ) : null}

      {previewFailed ? (
        <p role="alert" className="font-ui text-body-xs font-medium text-error">
          That cover image could not be loaded. Remove it and upload it again.
        </p>
      ) : null}

      {status === "error" && message ? (
        <Alert tone="error" title="Upload failed">
          {message}
        </Alert>
      ) : null}

      {status === "success" ? (
        <Alert tone="success" title="Cover uploaded">
          The image is stored. Save the story to apply it.
        </Alert>
      ) : null}

      {busy ? (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className="h-full bg-primary transition-[width] duration-(--duration-fast)"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="font-ui text-body-xs text-ink-muted" aria-live="polite">
            Uploading… {progress}%
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          id={`${groupId}-file`}
          type="file"
          accept={accept}
          className="sr-only"
          aria-label="Choose a cover image"
          onChange={handleFile}
          disabled={!uploadEnabled || busy}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<ImagePlus className="size-4" />}
          disabled={!uploadEnabled || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose image
        </Button>

        {busy ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => requestRef.current?.abort()}
          >
            Cancel
          </Button>
        ) : null}

        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leadingIcon={<X className="size-4" />}
            disabled={busy}
            onClick={handleRemove}
          >
            Remove cover
          </Button>
        ) : null}
      </div>

      {!uploadEnabled ? (
        <p className="font-ui text-body-xs text-ink-muted">
          Direct upload is not available in this environment. Image storage must
          be configured before a cover can be set.
        </p>
      ) : null}

      <TextField
        label="Cover image key"
        value={value}
        onChange={(event) => handleText(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        readOnly
        hint={
          uploadEnabled
            ? "Set by the upload above. Paste a stored key only to reuse one."
            : "Set by an upload once image storage is configured."
        }
        error={error}
      />

      <input type="hidden" name="coverImage" value={value} />
    </div>
  );
}
