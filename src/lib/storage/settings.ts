import { getEnv } from "@/lib/env";
import { resolveStorageConfig } from "./config";
import { isImageProcessingAvailable } from "./images";

/**
 * Upload affordance for the admin UI.
 *
 * Server-computed, non-secret values a form needs to render an uploader. It is
 * false when storage is unconfigured or the image pipeline is unavailable, so
 * the editor falls back to the URL field instead of offering a control that
 * would fail. The size ceiling is the same value the route enforces.
 */
export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";

export interface UploadSettings {
  enabled: boolean;
  maxBytes: number;
  maxMegabytes: number;
  accept: string;
}

function storageIsConfigured(): boolean {
  try {
    resolveStorageConfig();
    return true;
  } catch {
    return false;
  }
}

export async function getUploadSettings(): Promise<UploadSettings> {
  const env = getEnv();
  const enabled = storageIsConfigured() && (await isImageProcessingAvailable());
  return {
    enabled,
    maxBytes: env.UPLOAD_MAX_BYTES,
    maxMegabytes: Math.max(1, Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)),
    accept: UPLOAD_ACCEPT,
  };
}
