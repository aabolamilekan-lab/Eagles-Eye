/**
 * Core type definitions for news aggregation and ingestion.
 *
 * Used across the SSRF validator, URL normalizer, XML feed parser,
 * deduplication pipeline, and sync logging.
 */

export interface RawFeedItem {
  title: string;
  link: string;
  guid: string | null;
  publishedAt: Date | null;
  summary: string | null;
  author: string | null;
}

export interface ParsedFeed {
  title: string;
  description: string | null;
  link: string | null;
  items: RawFeedItem[];
}

export interface NormalizedArticleCandidate {
  title: string;
  canonicalUrl: string;
  externalId: string | null;
  rawPublishedAt: Date | null;
  summary: string | null;
  author: string | null;
  contentHash: string;
}

export interface DestinationValidationResult {
  valid: boolean;
  reason?: string;
  resolvedIps?: string[];
}

export type TransportFn = (
  options: import("node:http").RequestOptions,
  onResponse: (res: import("node:http").IncomingMessage) => void,
) => import("node:http").ClientRequest;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  etag?: string | null;
  lastModified?: string | null;
  dnsLookup?: (hostname: string) => Promise<string[]>;
  transport?: TransportFn;
}

export interface SafeFetchResponse {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  finalUrl: string;
}

export interface GeminiSummarizeInput {
  title: string;
  sourceContent: string;
  sourceName: string;
  canonicalUrl: string;
  author?: string | null;
  publishedAt?: Date | null;
}

export interface GeminiSummarizeResult {
  success: boolean;
  shortDescription?: string;
  summary?: string;
  wordCount?: {
    shortDescription: number;
    summary: number;
  };
  rejectionReason?: string;
  model: string;
  sourceName: string;
  canonicalUrl: string;
}

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  fetchFn?: FetchFunction;
}
